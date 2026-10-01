import { chainDef, maxLevel, type ChapterDef, type GameConfig } from './config';
import { kindKey } from './board';
import type { Rng } from './rng';
import type { Board, CellIndex, GameState, Order, OrderRequirement, Reward } from './types';

export function currentChapter(state: GameState, config: GameConfig): ChapterDef {
  const chapter = config.chapters[state.chapterId];
  if (!chapter) throw new Error(`Unknown chapter ${state.chapterId}`);
  return chapter;
}

/** Item chains the player can currently produce with an unblocked generator. */
export function producibleChains(state: GameState, config: GameConfig): string[] {
  const chains = new Set<string>();
  for (const cell of state.board.cells) {
    if (!cell.item || cell.blocker) continue;
    const def = chainDef(config, cell.item.chain);
    if (def.kind !== 'generator') continue;
    for (const p of def.items[cell.item.level - 1]?.generator?.produces ?? []) chains.add(p.chain);
  }
  if (chains.size === 0) return [...currentChapter(state, config).chains].sort();
  return [...chains].sort();
}

export function maxOrderLevel(chapter: ChapterDef, playerLevel: number): number {
  let result = 1;
  for (const step of chapter.orders.maxLevelByPlayerLevel) {
    if (playerLevel >= step.playerLevel) result = Math.max(result, step.maxLevel);
  }
  return result;
}

export function computeReward(requirements: OrderRequirement[], config: GameConfig, rng: Rng): Reward {
  const r = config.balance.orderRewards;
  let value = 0;
  let xp = 0;
  for (const req of requirements) {
    value += chainDef(config, req.chain).sellValue[req.level - 1] ?? 0;
    xp += req.level * r.xpPerItemLevel;
  }
  const reward: Reward = { coins: r.coinBase + Math.round(value * r.coinMultiplier), xp };
  if (rng.next() < r.energyChance) reward.energy = r.energyAmount;
  if (rng.next() < r.gemChance) reward.gems = r.gemAmount;
  return reward;
}

/** Orders only ask for what the player can produce right now: never an impossible order. */
export function generateOrder(state: GameState, config: GameConfig, rng: Rng): Order {
  const chapter = currentChapter(state, config);
  const rules = chapter.orders;
  const chains = producibleChains(state, config);
  const unlockedItems = Math.min(
    rules.maxItems,
    rules.minItems + Math.floor((state.level - 1) / Math.max(1, rules.extraItemEveryLevels))
  );
  const count = rules.minItems + rng.int(unlockedItems - rules.minItems + 1);
  const cap = maxOrderLevel(chapter, state.level);

  const requirements: OrderRequirement[] = [];
  for (let i = 0; i < count; i++) {
    const chain = rng.pick(chains);
    const top = Math.min(cap, maxLevel(config, chain));
    const bottom = Math.min(rules.minLevel, top);
    requirements.push({ chain, level: bottom + rng.int(top - bottom + 1) });
  }
  requirements.sort((a, b) => a.chain.localeCompare(b.chain) || a.level - b.level);
  return { id: state.nextId++, requirements, reward: computeReward(requirements, config, rng) };
}

/**
 * For each requirement, the board cell that would satisfy it (or null).
 * Each cell is used once; unpinned items are preferred, then row-major order.
 */
export function matchOrder(board: Board, requirements: OrderRequirement[]): (CellIndex | null)[] {
  const pools = new Map<string, CellIndex[]>();
  const candidates = board.cells
    .map((cell, i) => ({ cell, i }))
    .filter(({ cell }) => cell.item && !cell.blocker)
    .sort((a, b) => Number(!!a.cell.item?.pinned) - Number(!!b.cell.item?.pinned) || a.i - b.i);
  for (const { cell, i } of candidates) {
    const key = kindKey(cell.item!);
    const pool = pools.get(key) ?? [];
    pool.push(i);
    pools.set(key, pool);
  }
  return requirements.map((req) => pools.get(kindKey(req))?.shift() ?? null);
}
