import type { BalanceConfig } from './config';
import type { GameState } from './types';

/**
 * Applies time-based regeneration. Only timestamps are used (never a client timer),
 * so the server computes exactly the same value. Energy above max (rewards) is kept.
 */
export function settleEnergy(state: GameState, balance: BalanceConfig, now: number): void {
  const max = balance.energy.max;
  if (state.energy >= max) {
    state.energyUpdatedAt = now;
    return;
  }
  const period = balance.energy.regenSeconds * 1000;
  const elapsed = Math.max(0, now - state.energyUpdatedAt);
  const gained = Math.floor(elapsed / period);
  if (gained > 0) {
    state.energy = Math.min(max, state.energy + gained);
    state.energyUpdatedAt += gained * period;
  }
  if (state.energy >= max) state.energyUpdatedAt = now;
}

/** Read-only view for the UI: current energy and time until the next point. */
export function energyAt(
  state: GameState,
  balance: BalanceConfig,
  now: number
): { energy: number; max: number; nextInMs: number | null } {
  const copy = { ...state };
  settleEnergy(copy, balance, now);
  const max = balance.energy.max;
  if (copy.energy >= max) return { energy: copy.energy, max, nextInMs: null };
  const period = balance.energy.regenSeconds * 1000;
  return { energy: copy.energy, max, nextInMs: Math.max(0, period - (now - copy.energyUpdatedAt)) };
}
