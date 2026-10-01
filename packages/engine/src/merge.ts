import { cellAt, canLevelUp, clearAdjacentBlockers, neighbors, sameKind } from './board';
import type { GameConfig } from './config';
import type { GameEvent } from './events';
import { createItem } from './items';
import type { Board, CellIndex, GameState, Item } from './types';

/** Merge-5 is only offered when it beats doing pairs (e.g. 5 -> 3 instead of 4 -> 2 + 1 left). */
export function isMerge5Beneficial(config: GameConfig): boolean {
  const m = config.balance.merge5;
  return m.enabled && m.outputs > Math.floor(m.inputs / 2);
}

/**
 * Cells joining `source` in a merge-5 dropped on `target`: the target and its connected
 * identical neighbours (BFS order), excluding the source. Null if the group is too small.
 */
export function merge5Group(board: Board, config: GameConfig, source: CellIndex, target: CellIndex): CellIndex[] | null {
  const needed = config.balance.merge5.inputs - 1;
  const ref = cellAt(board, target).item;
  if (!ref) return null;
  const seen = new Set<CellIndex>([target, source]);
  const queue: CellIndex[] = [target];
  const group: CellIndex[] = [];
  while (queue.length > 0 && group.length < needed) {
    const current = queue.shift()!;
    const cell = cellAt(board, current);
    if (!cell.item || cell.blocker || !sameKind(cell.item, ref)) continue;
    if (current !== target && cell.item.pinned) continue;
    group.push(current);
    for (const n of neighbors(board, current)) {
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return group.length >= needed ? group : null;
}

/**
 * Replaces `inputs` by `outputCount` items of the next level placed on `outputCells`
 * (in order). Frees blockers on and around each output. Callers validate beforehand.
 */
export function performMerge(
  state: GameState,
  config: GameConfig,
  inputs: CellIndex[],
  outputCells: CellIndex[],
  kind: 'merge' | 'merge5' | 'auto',
  events: GameEvent[]
): Item[] {
  const board = state.board;
  const ref = cellAt(board, inputs[0]!).item!;
  for (const i of inputs) cellAt(board, i).item = null;

  const outputs: { cell: CellIndex; item: Item }[] = [];
  for (const cell of outputCells) {
    const item = createItem(state, config, ref.chain, ref.level + 1);
    cellAt(board, cell).item = item;
    outputs.push({ cell, item });
  }
  events.push({ type: 'merged', kind, inputs: [...inputs], outputs });

  for (const { cell } of outputs) {
    for (const freed of clearAdjacentBlockers(board, cell)) events.push({ type: 'unblocked', ...freed });
  }
  return outputs.map((o) => o.item);
}

export function canMergeItems(config: GameConfig, a: Item, b: Item): boolean {
  return sameKind(a, b) && canLevelUp(config, a);
}
