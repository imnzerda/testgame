import { isGenerator, sameKind } from './board';
import { chainDef, maxLevel, type GameConfig } from './config';
import { createItem } from './items';
import { generateOrder } from './orders';
import { dayKey } from './progression';
import { Rng } from './rng';
import type { Cell, Entitlements, GameState, Item } from './types';

export function createInitialState(config: GameConfig, opts: { seed: number; now: number }): GameState {
  const chapter = config.chapters[config.firstChapter];
  if (!chapter) throw new Error(`Unknown first chapter ${config.firstChapter}`);
  const { balance } = config;
  const cells: Cell[] = Array.from({ length: chapter.board.width * chapter.board.height }, () => ({
    item: null,
    blocker: null
  }));

  const state: GameState = {
    version: 1,
    rng: opts.seed >>> 0,
    nextId: 1,
    board: { width: chapter.board.width, height: chapter.board.height, cells },
    energy: balance.energy.start,
    energyUpdatedAt: opts.now,
    coins: balance.start.coins,
    gems: balance.start.gems,
    xp: 0,
    level: 1,
    orders: [],
    chapterId: chapter.id,
    tasksDone: [],
    chapterCompleted: false,
    autoMerge: { day: dayKey(opts.now), uses: 0 },
    settings: { protectOrderItems: true }
  };

  for (const def of chapter.initialBoard) {
    const cell = cells[def.cell]!;
    cell.item = createItem(state, config, def.chain, def.level);
    cell.blocker = def.blocker ?? null;
  }

  const rng = new Rng(state.rng);
  for (let slot = 0; slot < chapter.orders.slots; slot++) state.orders.push(generateOrder(state, config, rng));
  state.rng = rng.seed;
  return state;
}

/** UI helper: whether the auto-merge button is usable and how many uses remain today. */
export function autoMergeStatus(
  state: GameState,
  config: GameConfig,
  now: number,
  entitlements?: Entitlements
): { unlocked: boolean; remaining: number | null; unlockLevel: number } {
  const rules = config.balance.autoMerge;
  if (entitlements?.unlimitedAutoMerge) return { unlocked: true, remaining: null, unlockLevel: rules.unlockLevel };
  const used = state.autoMerge.day === dayKey(now) ? state.autoMerge.uses : 0;
  return {
    unlocked: state.level >= rules.unlockLevel,
    remaining: Math.max(0, rules.dailyUses - used),
    unlockLevel: rules.unlockLevel
  };
}

/** UI helper: two free cells that could merge right now (used later by the hint system). */
export function findMergeablePair(state: GameState, config: GameConfig): [number, number] | null {
  const cells = state.board.cells;
  for (let i = 0; i < cells.length; i++) {
    const a = cells[i]!;
    if (!a.item || a.blocker || a.item.level >= maxLevel(config, a.item.chain)) continue;
    for (let j = i + 1; j < cells.length; j++) {
      const b = cells[j]!;
      if (b.item && b.blocker !== 'box' && sameKind(a.item, b.item)) return [i, j];
    }
  }
  return null;
}

/**
 * Double-tap helper: the closest free, unpinned identical item that can be merged onto
 * `target` (Manhattan distance, ties broken by index). Null if there is none.
 */
export function findMergePartner(state: GameState, config: GameConfig, target: number): number | null {
  const board = state.board;
  const t = board.cells[target];
  if (!t?.item || t.blocker === 'box' || t.item.level >= maxLevel(config, t.item.chain)) return null;
  const tx = target % board.width;
  const ty = Math.floor(target / board.width);
  let best: number | null = null;
  let bestDist = Infinity;
  board.cells.forEach((cell, i) => {
    if (i === target || !cell.item || cell.blocker || cell.item.pinned || !sameKind(cell.item, t.item!)) return;
    const d = Math.abs((i % board.width) - tx) + Math.abs(Math.floor(i / board.width) - ty);
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  });
  return best;
}

export function sellValue(config: GameConfig, item: Item): number | null {
  if (isGenerator(config, item)) return null;
  return chainDef(config, item.chain).sellValue[item.level - 1] ?? 0;
}
