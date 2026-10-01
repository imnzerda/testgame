import type { BlockerKind } from './types';

export interface ProduceEntry {
  chain: string;
  level: number;
  weight: number;
}

export interface GeneratorSpec {
  produces: ProduceEntry[];
  /** null = unlimited (only energy limits it). */
  maxCharges: number | null;
  cooldownSec: number;
}

export interface ChainItemDef {
  level: number;
  key: string;
  generator?: GeneratorSpec;
}

export interface ChainDef {
  id: string;
  kind: 'item' | 'generator';
  city?: string;
  items: ChainItemDef[];
  sellValue: number[];
}

export interface InitialCellDef {
  cell: number;
  chain: string;
  level: number;
  blocker?: BlockerKind;
}

export interface RenovationTask {
  id: string;
  cost: number;
  xp: number;
  requires: string[];
}

export interface OrderRules {
  slots: number;
  minItems: number;
  maxItems: number;
  /** Player level from which each extra requirement slot unlocks. */
  extraItemEveryLevels: number;
  minLevel: number;
  maxLevelByPlayerLevel: { playerLevel: number; maxLevel: number }[];
}

export interface ChapterDef {
  id: string;
  city: string;
  board: { width: number; height: number };
  chains: string[];
  initialBoard: InitialCellDef[];
  orders: OrderRules;
  tasks: RenovationTask[];
}

export interface BalanceConfig {
  energy: { max: number; start: number; regenSeconds: number; costPerGenerate: number };
  start: { coins: number; gems: number };
  levels: { xpToNext: number[]; refillEnergyOnLevelUp: boolean };
  merge5: { enabled: boolean; inputs: number; outputs: number };
  autoMerge: { unlockLevel: number; dailyUses: number };
  orderRewards: {
    coinBase: number;
    coinMultiplier: number;
    xpPerItemLevel: number;
    energyChance: number;
    energyAmount: number;
    gemChance: number;
    gemAmount: number;
  };
}

export interface GameConfig {
  balance: BalanceConfig;
  chains: Record<string, ChainDef>;
  chapters: Record<string, ChapterDef>;
  firstChapter: string;
}

export function chainDef(config: GameConfig, chain: string): ChainDef {
  const def = config.chains[chain];
  if (!def) throw new Error(`Unknown chain "${chain}"`);
  return def;
}

export function maxLevel(config: GameConfig, chain: string): number {
  return chainDef(config, chain).items.length;
}

export function itemDef(config: GameConfig, chain: string, level: number): ChainItemDef {
  const def = chainDef(config, chain).items[level - 1];
  if (!def) throw new Error(`Unknown level ${level} for chain "${chain}"`);
  return def;
}

export function generatorSpec(config: GameConfig, chain: string, level: number): GeneratorSpec | null {
  return itemDef(config, chain, level).generator ?? null;
}

/** Returns a list of human-readable problems; empty when the config is consistent. */
export function validateConfig(config: GameConfig): string[] {
  const errors: string[] = [];
  const { balance } = config;

  for (const [id, chain] of Object.entries(config.chains)) {
    if (chain.id !== id) errors.push(`chain ${id}: id mismatch (${chain.id})`);
    if (chain.items.length === 0) errors.push(`chain ${id}: no items`);
    chain.items.forEach((item, i) => {
      if (item.level !== i + 1) errors.push(`chain ${id}: item ${item.key} has level ${item.level}, expected ${i + 1}`);
      if (chain.kind === 'generator' && !item.generator) errors.push(`chain ${id}: ${item.key} lacks generator spec`);
      if (chain.kind === 'item' && item.generator) errors.push(`chain ${id}: ${item.key} is not a generator chain`);
      for (const p of item.generator?.produces ?? []) {
        const target = config.chains[p.chain];
        if (!target) errors.push(`chain ${id}: ${item.key} produces unknown chain ${p.chain}`);
        else if (target.kind !== 'item') errors.push(`chain ${id}: ${item.key} produces a generator`);
        else if (p.level < 1 || p.level > target.items.length) errors.push(`chain ${id}: ${item.key} produces invalid level ${p.level}`);
        if (!(p.weight > 0)) errors.push(`chain ${id}: ${item.key} has non-positive weight`);
      }
    });
    if (chain.kind === 'item' && chain.sellValue.length !== chain.items.length) {
      errors.push(`chain ${id}: sellValue length ${chain.sellValue.length} != ${chain.items.length}`);
    }
  }

  if (!config.chapters[config.firstChapter]) errors.push(`firstChapter ${config.firstChapter} not found`);

  for (const [id, chapter] of Object.entries(config.chapters)) {
    const size = chapter.board.width * chapter.board.height;
    const used = new Set<number>();
    for (const c of chapter.chains) if (!config.chains[c]) errors.push(`chapter ${id}: unknown chain ${c}`);
    for (const cell of chapter.initialBoard) {
      if (cell.cell < 0 || cell.cell >= size) errors.push(`chapter ${id}: cell ${cell.cell} out of bounds`);
      if (used.has(cell.cell)) errors.push(`chapter ${id}: cell ${cell.cell} defined twice`);
      used.add(cell.cell);
      const chain = config.chains[cell.chain];
      if (!chain) errors.push(`chapter ${id}: unknown chain ${cell.chain}`);
      else if (cell.level < 1 || cell.level > chain.items.length) errors.push(`chapter ${id}: invalid level at cell ${cell.cell}`);
    }
    const taskIds = new Set(chapter.tasks.map((t) => t.id));
    for (const task of chapter.tasks) {
      for (const r of task.requires) if (!taskIds.has(r)) errors.push(`chapter ${id}: task ${task.id} requires unknown ${r}`);
    }
    const o = chapter.orders;
    if (o.minItems < 1 || o.maxItems < o.minItems) errors.push(`chapter ${id}: invalid order item counts`);
    if (o.maxLevelByPlayerLevel.length === 0) errors.push(`chapter ${id}: maxLevelByPlayerLevel is empty`);
  }

  if (balance.levels.xpToNext.length === 0) errors.push('balance: xpToNext is empty');
  if (balance.merge5.outputs > balance.merge5.inputs) errors.push('balance: merge5 creates more items than it consumes');
  if (balance.energy.regenSeconds <= 0) errors.push('balance: regenSeconds must be positive');
  return errors;
}
