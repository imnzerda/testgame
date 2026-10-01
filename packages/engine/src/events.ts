import type { BlockerKind, CellIndex, Item, Order, Reward } from './types';

/** Events describe what happened so the renderer can animate it. They carry no authority. */
export type GameEvent =
  | { type: 'spawned'; from: CellIndex; to: CellIndex; item: Item }
  | { type: 'moved'; from: CellIndex; to: CellIndex }
  | { type: 'swapped'; a: CellIndex; b: CellIndex }
  | {
      type: 'merged';
      kind: 'merge' | 'merge5' | 'auto';
      inputs: CellIndex[];
      outputs: { cell: CellIndex; item: Item }[];
    }
  | { type: 'unblocked'; cell: CellIndex; blocker: BlockerKind }
  | { type: 'sold'; cell: CellIndex; coins: number }
  | { type: 'delivered'; slot: number; cells: CellIndex[]; reward: Reward }
  | { type: 'order_created'; slot: number; order: Order }
  | { type: 'level_up'; level: number }
  | { type: 'energy_empty' }
  | { type: 'pinned'; cell: CellIndex; pinned: boolean }
  | { type: 'renovated'; taskId: string }
  | { type: 'chapter_completed'; chapterId: string }
  | { type: 'auto_merge_used'; steps: number };
