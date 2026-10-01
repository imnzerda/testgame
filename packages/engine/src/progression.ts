import type { BalanceConfig } from './config';
import type { GameEvent } from './events';
import type { GameState } from './types';

export function xpToNext(balance: BalanceConfig, level: number): number {
  const table = balance.levels.xpToNext;
  return table[Math.min(level - 1, table.length - 1)] as number;
}

export function addXp(state: GameState, balance: BalanceConfig, xp: number, events: GameEvent[]): void {
  state.xp += xp;
  while (state.xp >= xpToNext(balance, state.level)) {
    state.xp -= xpToNext(balance, state.level);
    state.level += 1;
    if (balance.levels.refillEnergyOnLevelUp) {
      state.energy = Math.max(state.energy, balance.energy.max);
    }
    events.push({ type: 'level_up', level: state.level });
  }
}

/** UTC day key; phase 2 will use the player's timezone. */
export function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}
