import { describe, expect, it } from 'vitest';
import { applyAction, createInitialState, generateOrder, matchOrder, producibleChains, Rng } from '../src';
import { boardOf, ctx, NOW, order, stateWith, testConfig } from './fixtures';

const config = testConfig();

describe('order generation', () => {
  it('creates the configured number of orders at start', () => {
    const s = createInitialState(config, { seed: 1, now: NOW });
    expect(s.orders).toHaveLength(3);
  });

  it('only asks for chains the player can produce, within level bounds', () => {
    // Only gen1 on board -> produces chain "a" only.
    const s = stateWith(config, [{ cell: 0, chain: 'gen', level: 1 }]);
    expect(producibleChains(s, config)).toEqual(['a']);
    const rng = new Rng(7);
    for (let i = 0; i < 300; i++) {
      const o = generateOrder(s, config, rng);
      expect(o.requirements.length).toBe(1); // level 1 player: single item orders
      for (const req of o.requirements) {
        expect(req.chain).toBe('a');
        expect(req.level).toBe(2);
      }
    }
  });

  it('a blocked generator does not count as producible', () => {
    const s = stateWith(config, [
      { cell: 0, chain: 'gen', level: 1 },
      { cell: 1, chain: 'gen', level: 2, blocker: 'web' }
    ]);
    expect(producibleChains(s, config)).toEqual(['a']);
  });

  it('scales item count and level with player level', () => {
    const s = stateWith(config, [{ cell: 0, chain: 'gen', level: 2 }], { level: 5 });
    const rng = new Rng(3);
    const sizes = new Set<number>();
    const levels = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const o = generateOrder(s, config, rng);
      sizes.add(o.requirements.length);
      for (const r of o.requirements) levels.add(r.level);
      expect(o.reward.coins).toBeGreaterThan(0);
    }
    expect([...sizes].sort()).toEqual([1, 2, 3]);
    expect([...levels].sort()).toEqual([2, 3]);
  });
});

describe('deliver', () => {
  it('consumes matching items, grants rewards and replaces the order', () => {
    const s = stateWith(
      config,
      [
        { cell: 0, chain: 'gen', level: 1 },
        { cell: 3, chain: 'a', level: 2 },
        { cell: 7, chain: 'a', level: 2 },
        { cell: 9, chain: 'b', level: 1 }
      ],
      { orders: [order([{ chain: 'a', level: 2 }, { chain: 'b', level: 1 }], 7, 3), null, null] }
    );
    const r = applyAction(s, { type: 'deliver', slot: 0 }, ctx(config));
    if (!r.ok) throw new Error(r.error);
    expect(boardOf(r.state)[3]).toBeNull();
    expect(boardOf(r.state)[7]).toBe('a2');
    expect(boardOf(r.state)[9]).toBeNull();
    expect(r.state.coins).toBe(7);
    expect(r.state.xp).toBe(3);
    expect(r.state.orders[0]!.id).not.toBe(9999);
  });

  it('fails when items are missing or the slot is empty', () => {
    const s = stateWith(config, [{ cell: 3, chain: 'a', level: 2, blocker: 'web' }], {
      orders: [order([{ chain: 'a', level: 2 }]), null, null]
    });
    expect(applyAction(s, { type: 'deliver', slot: 0 }, ctx(config))).toEqual({ ok: false, error: 'order_incomplete' });
    expect(applyAction(s, { type: 'deliver', slot: 1 }, ctx(config))).toEqual({ ok: false, error: 'no_order' });
  });

  it('prefers unpinned items and needs one item per requirement', () => {
    const s = stateWith(config, [
      { cell: 0, chain: 'a', level: 2, pinned: true },
      { cell: 5, chain: 'a', level: 2 }
    ]);
    expect(matchOrder(s.board, [{ chain: 'a', level: 2 }])).toEqual([5]);
    expect(matchOrder(s.board, [{ chain: 'a', level: 2 }, { chain: 'a', level: 2 }])).toEqual([5, 0]);
    expect(matchOrder(s.board, [{ chain: 'a', level: 2 }, { chain: 'a', level: 2 }, { chain: 'a', level: 2 }])).toEqual([5, 0, null]);
  });

  it('levels up and refills energy', () => {
    const s = stateWith(config, [{ cell: 3, chain: 'a', level: 2 }], {
      energy: 4,
      energyUpdatedAt: NOW,
      xp: 9,
      orders: [order([{ chain: 'a', level: 2 }], 1, 3), null, null]
    });
    const r = applyAction(s, { type: 'deliver', slot: 0 }, ctx(config));
    if (!r.ok) throw new Error(r.error);
    expect(r.state.level).toBe(2);
    expect(r.state.xp).toBe(2);
    expect(r.state.energy).toBe(100);
    expect(r.events.some((e) => e.type === 'level_up')).toBe(true);
  });
});

describe('sell, pin, renovate', () => {
  it('sells items for their sell value but never generators', () => {
    const s = stateWith(config, [
      { cell: 0, chain: 'gen', level: 1 },
      { cell: 1, chain: 'a', level: 3 }
    ]);
    const r = applyAction(s, { type: 'sell', cell: 1 }, ctx(config));
    expect(r.ok && r.state.coins).toBe(4);
    expect(applyAction(s, { type: 'sell', cell: 0 }, ctx(config))).toEqual({ ok: false, error: 'not_sellable' });
  });

  it('toggles the player lock', () => {
    const s = stateWith(config, [{ cell: 1, chain: 'a', level: 1 }]);
    const r = applyAction(s, { type: 'pin', cell: 1 }, ctx(config));
    if (!r.ok) throw new Error(r.error);
    expect(r.state.board.cells[1]!.item!.pinned).toBe(true);
    const r2 = applyAction(r.state, { type: 'pin', cell: 1 }, ctx(config));
    expect(r2.ok && r2.state.board.cells[1]!.item!.pinned).toBeUndefined();
  });

  it('renovates tasks in order and completes the chapter', () => {
    const s = stateWith(config, [], { coins: 35 });
    expect(applyAction(s, { type: 'renovate', taskId: 't2' }, ctx(config))).toEqual({ ok: false, error: 'task_locked' });
    const r1 = applyAction(s, { type: 'renovate', taskId: 't1' }, ctx(config));
    if (!r1.ok) throw new Error(r1.error);
    expect(applyAction(r1.state, { type: 'renovate', taskId: 't1' }, ctx(config))).toEqual({ ok: false, error: 'task_done' });
    const r2 = applyAction(r1.state, { type: 'renovate', taskId: 't2' }, ctx(config));
    if (!r2.ok) throw new Error(r2.error);
    expect(r2.state.coins).toBe(5);
    expect(r2.state.chapterCompleted).toBe(true);
    expect(r2.events.some((e) => e.type === 'chapter_completed')).toBe(true);
    const poor = stateWith(config, [], { coins: 5 });
    expect(applyAction(poor, { type: 'renovate', taskId: 't1' }, ctx(config))).toEqual({ ok: false, error: 'not_enough_coins' });
  });
});
