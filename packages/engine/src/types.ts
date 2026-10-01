export type CellIndex = number;

/** Runtime state of a generator with limited charges. */
export interface GeneratorState {
  charges: number;
  /** Timestamp (ms) at which charges are refilled, null when not on cooldown. */
  rechargeAt: number | null;
}

export interface Item {
  id: number;
  chain: string;
  level: number;
  /** Player lock (long press): excluded from auto-merge and merge-5 groups. */
  pinned?: boolean;
  gen?: GeneratorState;
}

/** web: item visible, can be merged onto. box: item hidden, freed only by an adjacent merge. */
export type BlockerKind = 'web' | 'box';

export interface Cell {
  item: Item | null;
  blocker: BlockerKind | null;
}

export interface Board {
  width: number;
  height: number;
  cells: Cell[];
}

export interface OrderRequirement {
  chain: string;
  level: number;
}

export interface Reward {
  coins: number;
  xp: number;
  energy?: number;
  gems?: number;
}

export interface Order {
  id: number;
  requirements: OrderRequirement[];
  reward: Reward;
}

export interface PlayerSettings {
  protectOrderItems: boolean;
}

export interface GameState {
  version: 1;
  /** Seeded RNG state: the server replays the exact same draws. */
  rng: number;
  nextId: number;
  board: Board;
  energy: number;
  energyUpdatedAt: number;
  coins: number;
  gems: number;
  /** XP accumulated inside the current level. */
  xp: number;
  level: number;
  orders: (Order | null)[];
  chapterId: string;
  tasksDone: string[];
  chapterCompleted: boolean;
  autoMerge: { day: string; uses: number };
  settings: PlayerSettings;
}

export interface Entitlements {
  unlimitedAutoMerge?: boolean;
}
