import {
  createInitialState,
  type ApplyContext,
  type BlockerKind,
  type GameConfig,
  type GameState,
  type Order
} from '../src';

export const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

/** Small 4x4 test world, independent from the real balancing data. */
export function testConfig(overrides: Partial<GameConfig['balance']> = {}): GameConfig {
  return {
    firstChapter: 'test',
    balance: {
      energy: { max: 100, start: 100, regenSeconds: 120, costPerGenerate: 1 },
      start: { coins: 0, gems: 0 },
      levels: { xpToNext: [10, 20, 30], refillEnergyOnLevelUp: true },
      merge5: { enabled: true, inputs: 5, outputs: 3 },
      autoMerge: { unlockLevel: 10, dailyUses: 3 },
      orderRewards: {
        coinBase: 2,
        coinMultiplier: 1,
        xpPerItemLevel: 1,
        energyChance: 0,
        energyAmount: 5,
        gemChance: 0,
        gemAmount: 1
      },
      ...overrides
    },
    chains: {
      a: {
        id: 'a',
        kind: 'item',
        items: [
          { level: 1, key: 'a1' },
          { level: 2, key: 'a2' },
          { level: 3, key: 'a3' },
          { level: 4, key: 'a4' }
        ],
        sellValue: [1, 2, 4, 8]
      },
      b: {
        id: 'b',
        kind: 'item',
        items: [
          { level: 1, key: 'b1' },
          { level: 2, key: 'b2' },
          { level: 3, key: 'b3' }
        ],
        sellValue: [1, 2, 4]
      },
      gen: {
        id: 'gen',
        kind: 'generator',
        items: [
          {
            level: 1,
            key: 'gen1',
            generator: { produces: [{ chain: 'a', level: 1, weight: 1 }], maxCharges: null, cooldownSec: 0 }
          },
          {
            level: 2,
            key: 'gen2',
            generator: {
              produces: [
                { chain: 'a', level: 1, weight: 3 },
                { chain: 'b', level: 1, weight: 1 }
              ],
              maxCharges: 2,
              cooldownSec: 60
            }
          }
        ],
        sellValue: [0, 0]
      }
    },
    chapters: {
      test: {
        id: 'test',
        city: 'test',
        board: { width: 4, height: 4 },
        chains: ['a', 'b'],
        initialBoard: [{ cell: 0, chain: 'gen', level: 1 }],
        orders: {
          slots: 3,
          minItems: 1,
          maxItems: 3,
          extraItemEveryLevels: 2,
          minLevel: 2,
          maxLevelByPlayerLevel: [
            { playerLevel: 1, maxLevel: 2 },
            { playerLevel: 3, maxLevel: 3 }
          ]
        },
        tasks: [
          { id: 't1', cost: 10, xp: 5, requires: [] },
          { id: 't2', cost: 20, xp: 5, requires: ['t1'] }
        ]
      }
    }
  };
}

export interface CellSpec {
  cell: number;
  chain: string;
  level: number;
  blocker?: BlockerKind;
  pinned?: boolean;
}

/** Builds a state whose board contains exactly `cells`, with no orders unless given. */
export function stateWith(
  config: GameConfig,
  cells: CellSpec[],
  extra: Partial<GameState> & { orders?: (Order | null)[] } = {}
): GameState {
  const state = createInitialState(config, { seed: 42, now: NOW });
  for (const c of state.board.cells) {
    c.item = null;
    c.blocker = null;
  }
  for (const spec of cells) {
    const cell = state.board.cells[spec.cell]!;
    cell.item = { id: state.nextId++, chain: spec.chain, level: spec.level };
    if (spec.pinned) cell.item.pinned = true;
    const genSpec = config.chains[spec.chain]?.items[spec.level - 1]?.generator;
    if (genSpec && genSpec.maxCharges !== null) cell.item.gen = { charges: genSpec.maxCharges, rechargeAt: null };
    cell.blocker = spec.blocker ?? null;
  }
  state.orders = [null, null, null];
  return { ...state, ...extra };
}

export function ctx(config: GameConfig, now = NOW, extra: Partial<ApplyContext> = {}): ApplyContext {
  return { config, now, ...extra };
}

export function itemAt(state: GameState, cell: number): string | null {
  const c = state.board.cells[cell]!;
  return c.item ? `${c.item.chain}${c.item.level}` : null;
}

/** Board as compact strings, e.g. ['a1', null, ...]. */
export function boardOf(state: GameState): (string | null)[] {
  return state.board.cells.map((_, i) => itemAt(state, i));
}

export function order(requirements: { chain: string; level: number }[], coins = 5, xp = 2): Order {
  return { id: 9999, requirements, reward: { coins, xp } };
}
