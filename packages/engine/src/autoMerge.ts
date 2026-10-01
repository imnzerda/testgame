import { canLevelUp, isGenerator, kindKey } from './board';
import type { GameConfig } from './config';
import type { GameEvent } from './events';
import { isMerge5Beneficial, performMerge } from './merge';
import type { CellIndex, GameState } from './types';

const MAX_STEPS = 10_000;

/** How many items of each kind active orders need (protected from auto-merge). */
export function reservedCounts(state: GameState): Map<string, number> {
  const counts = new Map<string, number>();
  if (!state.settings.protectOrderItems) return counts;
  for (const order of state.orders) {
    for (const req of order?.requirements ?? []) {
      counts.set(kindKey(req), (counts.get(kindKey(req)) ?? 0) + 1);
    }
  }
  return counts;
}

/** Eligible cells grouped by kind, in row-major order, once reserved items are set aside. */
function mergeableGroups(state: GameState, config: GameConfig): { key: string; level: number; cells: CellIndex[] }[] {
  const reserved = reservedCounts(state);
  const groups = new Map<string, { key: string; level: number; cells: CellIndex[] }>();
  state.board.cells.forEach((cell, i) => {
    const item = cell.item;
    if (!item || cell.blocker || item.pinned) return;
    if (isGenerator(config, item) || !canLevelUp(config, item)) return;
    const key = kindKey(item);
    const left = reserved.get(key) ?? 0;
    if (left > 0) {
      reserved.set(key, left - 1);
      return;
    }
    const group = groups.get(key) ?? { key, level: item.level, cells: [] };
    group.cells.push(i);
    groups.set(key, group);
  });
  return [...groups.values()];
}

/**
 * Deterministic auto-merge: lowest levels first, then left-to-right / top-to-bottom.
 * Uses merge-5 when it is beneficial. Generators are never auto-merged.
 * Returns the number of merge steps performed.
 */
export function runAutoMerge(state: GameState, config: GameConfig, events: GameEvent[]): number {
  const m5 = isMerge5Beneficial(config);
  const { inputs: m5In, outputs: m5Out } = config.balance.merge5;
  let steps = 0;
  while (steps < MAX_STEPS) {
    const candidates = mergeableGroups(state, config)
      .filter((g) => g.cells.length >= 2)
      .sort((a, b) => a.level - b.level || a.cells[0]! - b.cells[0]!);
    const group = candidates[0];
    if (!group) break;
    if (m5 && group.cells.length >= m5In) {
      const inputs = group.cells.slice(0, m5In);
      performMerge(state, config, inputs, inputs.slice(0, m5Out), 'auto', events);
    } else {
      const inputs = group.cells.slice(0, 2);
      performMerge(state, config, inputs, [inputs[0]!], 'auto', events);
    }
    steps++;
  }
  return steps;
}
