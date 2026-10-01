import { chainDef, maxLevel, type GameConfig } from './config';
import type { BlockerKind, Board, Cell, CellIndex, Item } from './types';

export function cellAt(board: Board, index: CellIndex): Cell {
  const cell = board.cells[index];
  if (!cell) throw new Error(`Cell ${index} out of bounds`);
  return cell;
}

export function isValidCell(board: Board, index: unknown): index is CellIndex {
  return typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < board.cells.length;
}

export function coords(board: Board, index: CellIndex): { x: number; y: number } {
  return { x: index % board.width, y: Math.floor(index / board.width) };
}

export function neighbors(board: Board, index: CellIndex): CellIndex[] {
  const { x, y } = coords(board, index);
  const result: CellIndex[] = [];
  if (y > 0) result.push(index - board.width);
  if (x > 0) result.push(index - 1);
  if (x < board.width - 1) result.push(index + 1);
  if (y < board.height - 1) result.push(index + board.width);
  return result;
}

export function sameKind(a: Item, b: Item): boolean {
  return a.chain === b.chain && a.level === b.level;
}

export function isGenerator(config: GameConfig, item: Item): boolean {
  return chainDef(config, item.chain).kind === 'generator';
}

export function canLevelUp(config: GameConfig, item: Item): boolean {
  return item.level < maxLevel(config, item.chain);
}

/** Closest free empty cell (Manhattan distance, ties broken by index). */
export function findEmptyNear(board: Board, origin: CellIndex): CellIndex | null {
  const o = coords(board, origin);
  let best: CellIndex | null = null;
  let bestDist = Infinity;
  board.cells.forEach((cell, i) => {
    if (cell.item || cell.blocker) return;
    const c = coords(board, i);
    const d = Math.abs(c.x - o.x) + Math.abs(c.y - o.y);
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  });
  return best;
}

/** Merging next to a blocker (or on it) frees it. Returns freed cells. */
export function clearAdjacentBlockers(board: Board, center: CellIndex): { cell: CellIndex; blocker: BlockerKind }[] {
  const freed: { cell: CellIndex; blocker: BlockerKind }[] = [];
  for (const i of [center, ...neighbors(board, center)]) {
    const cell = cellAt(board, i);
    if (cell.blocker) {
      freed.push({ cell: i, blocker: cell.blocker });
      cell.blocker = null;
    }
  }
  return freed;
}

/** Key identifying items that can merge together. */
export function kindKey(item: { chain: string; level: number }): string {
  return `${item.chain}#${item.level}`;
}
