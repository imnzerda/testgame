import { describe, expect, it } from 'vitest';
import { applyAction, energyAt, type GameState } from '../src';
import { boardOf, ctx, NOW, stateWith, testConfig } from './fixtures';

const config = testConfig();

describe('generate', () => {
  it('spends energy and places a level-1 item on the nearest empty cell', () => {
    const s = stateWith(config, [
      { cell: 5, chain: 'gen', level: 1 },
      { cell: 4, chain: 'b', level: 1 }
    ]);
    const r = applyAction(s, { type: 'generate', cell: 5 }, ctx(config));
    if (!r.ok) throw new Error(r.error);
    expect(r.state.energy).toBe(99);
    // Nearest empty at distance 1, lowest index first: cell 1 (above).
    expect(boardOf(r.state)[1]).toBe('a1');
    expect(r.events[0]).toMatchObject({ type: 'spawned', from: 5, to: 1 });
  });

  it('fails without energy, when the board is full, or on a non-generator', () => {
    const empty = stateWith(config, [{ cell: 0, chain: 'gen', level: 1 }], { energy: 0, energyUpdatedAt: NOW });
    expect(applyAction(empty, { type: 'generate', cell: 0 }, ctx(config))).toEqual({ ok: false, error: 'no_energy' });

    const full = stateWith(config, [
      { cell: 0, chain: 'gen', level: 1 },
      ...Array.from({ length: 15 }, (_, i) => ({ cell: i + 1, chain: 'b', level: 1 }))
    ]);
    expect(applyAction(full, { type: 'generate', cell: 0 }, ctx(config))).toEqual({ ok: false, error: 'board_full' });
    expect(applyAction(full, { type: 'generate', cell: 1 }, ctx(config))).toEqual({ ok: false, error: 'not_generator' });
  });

  it('reports energy_empty when the last point is spent', () => {
    const s = stateWith(config, [{ cell: 0, chain: 'gen', level: 1 }], { energy: 1, energyUpdatedAt: NOW });
    const r = applyAction(s, { type: 'generate', cell: 0 }, ctx(config));
    expect(r.ok && r.events.some((e) => e.type === 'energy_empty')).toBe(true);
  });

  it('respects limited charges and the cooldown', () => {
    let s: GameState = stateWith(config, [{ cell: 0, chain: 'gen', level: 2 }]);
    for (let i = 0; i < 2; i++) {
      const r = applyAction(s, { type: 'generate', cell: 0 }, ctx(config));
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    expect(s.board.cells[0]!.item!.gen).toEqual({ charges: 0, rechargeAt: NOW + 60_000 });
    expect(applyAction(s, { type: 'generate', cell: 0 }, ctx(config, NOW + 59_000))).toEqual({
      ok: false,
      error: 'generator_cooldown'
    });
    expect(applyAction(s, { type: 'generate', cell: 0 }, ctx(config, NOW + 60_000)).ok).toBe(true);
  });

  it('is deterministic for a given seed and follows the configured weights', () => {
    let s: GameState = stateWith(config, [{ cell: 0, chain: 'gen', level: 2 }]);
    const counts: Record<string, number> = { a1: 0, b1: 0 };
    const unlimited = testConfig();
    unlimited.chains.gen!.items[1]!.generator!.maxCharges = null;
    s.board.cells[0]!.item!.gen = undefined;
    for (let i = 0; i < 4000; i++) {
      const r = applyAction({ ...s, energy: 100 }, { type: 'generate', cell: 0 }, ctx(unlimited));
      if (!r.ok) throw new Error(r.error);
      const spawned = r.events[0];
      if (spawned?.type !== 'spawned') throw new Error('no spawn');
      counts[`${spawned.item.chain}${spawned.item.level}`]!++;
      s = { ...r.state, board: s.board };
    }
    // weights a1:3, b1:1
    expect(counts.a1! / 4000).toBeGreaterThan(0.7);
    expect(counts.a1! / 4000).toBeLessThan(0.8);

    const base = stateWith(config, [{ cell: 0, chain: 'gen', level: 2 }]);
    const x = applyAction(base, { type: 'generate', cell: 0 }, ctx(config));
    const y = applyAction(base, { type: 'generate', cell: 0 }, ctx(config));
    expect(x).toEqual(y);
  });
});

describe('energy', () => {
  it('regenerates one point per period from the stored timestamp', () => {
    const s = stateWith(config, [{ cell: 0, chain: 'gen', level: 1 }], { energy: 10, energyUpdatedAt: NOW });
    expect(energyAt(s, config.balance, NOW + 119_000)).toEqual({ energy: 10, max: 100, nextInMs: 1_000 });
    expect(energyAt(s, config.balance, NOW + 5 * 120_000 + 30_000)).toEqual({
      energy: 15,
      max: 100,
      nextInMs: 90_000
    });
  });

  it('keeps fractional progress after spending and caps at max', () => {
    const s = stateWith(config, [{ cell: 0, chain: 'gen', level: 1 }], { energy: 10, energyUpdatedAt: NOW });
    const r = applyAction(s, { type: 'generate', cell: 0 }, ctx(config, NOW + 180_000));
    if (!r.ok) throw new Error(r.error);
    expect(r.state.energy).toBe(10);
    expect(r.state.energyUpdatedAt).toBe(NOW + 120_000);
    expect(energyAt(r.state, config.balance, NOW + 1000 * 3600 * 24).energy).toBe(100);
  });

  it('starts regenerating from the moment energy drops below max', () => {
    const s = stateWith(config, [{ cell: 0, chain: 'gen', level: 1 }], { energy: 100, energyUpdatedAt: NOW - 10_000_000 });
    const r = applyAction(s, { type: 'generate', cell: 0 }, ctx(config));
    if (!r.ok) throw new Error(r.error);
    expect(r.state.energy).toBe(99);
    expect(energyAt(r.state, config.balance, NOW + 119_999).energy).toBe(99);
    expect(energyAt(r.state, config.balance, NOW + 120_000).energy).toBe(100);
  });

  it('keeps bonus energy above max', () => {
    const s = stateWith(config, [], { energy: 130, energyUpdatedAt: NOW });
    expect(energyAt(s, config.balance, NOW + 1_000_000).energy).toBe(130);
  });
});
