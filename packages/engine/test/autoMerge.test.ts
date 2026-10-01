import { describe, expect, it } from 'vitest';
import { applyAction, autoMergeStatus, type GameEvent } from '../src';
import { boardOf, ctx, NOW, order, stateWith, testConfig } from './fixtures';

const config = testConfig();
const DAY = 24 * 3600 * 1000;

function mergedSteps(events: GameEvent[]) {
  return events.filter((e): e is Extract<GameEvent, { type: 'merged' }> => e.type === 'merged');
}

describe('auto_merge', () => {
  it('is locked below the unlock level, unless the player has the entitlement', () => {
    const s = stateWith(config, [
      { cell: 0, chain: 'a', level: 1 },
      { cell: 1, chain: 'a', level: 1 }
    ]);
    expect(applyAction(s, { type: 'auto_merge' }, ctx(config))).toEqual({ ok: false, error: 'auto_merge_locked' });
    const sub = applyAction(s, { type: 'auto_merge' }, ctx(config, NOW, { entitlements: { unlimitedAutoMerge: true } }));
    expect(sub.ok).toBe(true);
  });

  it('merges lowest levels first, left-to-right top-to-bottom, and cascades', () => {
    const s = stateWith(
      config,
      [
        { cell: 0, chain: 'b', level: 2 },
        { cell: 1, chain: 'a', level: 1 },
        { cell: 3, chain: 'b', level: 2 },
        { cell: 6, chain: 'a', level: 1 },
        { cell: 8, chain: 'a', level: 2 }
      ],
      { level: 10 }
    );
    const r = applyAction(s, { type: 'auto_merge' }, ctx(config));
    if (!r.ok) throw new Error(r.error);
    const steps = mergedSteps(r.events);
    // a1+a1 -> a2 on cell 1; then both level-2 pairs: b2 (starts at cell 0) before a2 (starts at cell 1).
    expect(steps.map((m) => [m.inputs, m.outputs.map((o) => o.cell)])).toEqual([
      [[1, 6], [1]],
      [[0, 3], [0]],
      [[1, 8], [1]]
    ]);
    expect(boardOf(r.state).filter(Boolean)).toEqual(['b3', 'a3']);
    expect(r.state.autoMerge.uses).toBe(1);
  });

  it('is deterministic', () => {
    const cells = [0, 2, 5, 7, 9, 11, 12, 14].map((cell, i) => ({ cell, chain: i % 2 ? 'a' : 'b', level: 1 }));
    const s = stateWith(config, cells, { level: 10 });
    const r1 = applyAction(s, { type: 'auto_merge' }, ctx(config));
    const r2 = applyAction(s, { type: 'auto_merge' }, ctx(config));
    expect(r1).toEqual(r2);
  });

  it('uses merge-5 when 5 identical items are available', () => {
    const cells = [0, 1, 2, 3, 4].map((cell) => ({ cell, chain: 'a', level: 1 }));
    const s = stateWith(config, cells, { level: 10 });
    const r = applyAction(s, { type: 'auto_merge' }, ctx(config));
    if (!r.ok) throw new Error(r.error);
    const first = mergedSteps(r.events)[0]!;
    expect(first.inputs).toEqual([0, 1, 2, 3, 4]);
    expect(first.outputs.map((o) => o.cell)).toEqual([0, 1, 2]);
    // 3 a2 -> one a3 + one a2 left
    expect(boardOf(r.state).filter(Boolean).sort()).toEqual(['a2', 'a3']);
  });

  it('protects items needed by active orders', () => {
    const s = stateWith(
      config,
      [
        { cell: 0, chain: 'a', level: 2 },
        { cell: 1, chain: 'a', level: 2 },
        { cell: 2, chain: 'a', level: 2 }
      ],
      { level: 10, orders: [order([{ chain: 'a', level: 2 }]), null, null] }
    );
    const r = applyAction(s, { type: 'auto_merge' }, ctx(config));
    if (!r.ok) throw new Error(r.error);
    expect(boardOf(r.state).filter(Boolean).sort()).toEqual(['a2', 'a3']);
    expect(boardOf(r.state)[0]).toBe('a2');

    const unprotected = { ...s, settings: { protectOrderItems: false } };
    const r2 = applyAction(unprotected, { type: 'auto_merge' }, ctx(config));
    if (!r2.ok) throw new Error(r2.error);
    expect(boardOf(r2.state).filter(Boolean).sort()).toEqual(['a2', 'a3']);
    expect(boardOf(r2.state)[0]).toBe('a3');
  });

  it('skips pinned, blocked items and generators', () => {
    const s = stateWith(
      config,
      [
        { cell: 0, chain: 'a', level: 1, pinned: true },
        { cell: 1, chain: 'a', level: 1 },
        { cell: 10, chain: 'a', level: 1, blocker: 'web' },
        { cell: 4, chain: 'gen', level: 1 },
        { cell: 5, chain: 'gen', level: 1 }
      ],
      { level: 10 }
    );
    expect(applyAction(s, { type: 'auto_merge' }, ctx(config))).toEqual({ ok: false, error: 'nothing_to_merge' });
  });

  it('frees blockers next to merges, which can then take part in the cascade', () => {
    const s = stateWith(
      config,
      [
        { cell: 0, chain: 'a', level: 1 },
        { cell: 1, chain: 'a', level: 1 },
        { cell: 4, chain: 'a', level: 2, blocker: 'box' }
      ],
      { level: 10 }
    );
    const r = applyAction(s, { type: 'auto_merge' }, ctx(config));
    if (!r.ok) throw new Error(r.error);
    expect(boardOf(r.state).filter(Boolean)).toEqual(['a3']);
  });

  it('limits free uses per day and resets the next day', () => {
    const s = stateWith(config, [], { level: 10, autoMerge: { day: '2026-01-15', uses: 3 } });
    s.board.cells[0]!.item = { id: 500, chain: 'a', level: 1 };
    s.board.cells[1]!.item = { id: 501, chain: 'a', level: 1 };
    expect(applyAction(s, { type: 'auto_merge' }, ctx(config))).toEqual({ ok: false, error: 'auto_merge_exhausted' });
    expect(autoMergeStatus(s, config, NOW).remaining).toBe(0);
    const tomorrow = applyAction(s, { type: 'auto_merge' }, ctx(config, NOW + DAY));
    expect(tomorrow.ok && tomorrow.state.autoMerge).toEqual({ day: '2026-01-16', uses: 1 });
  });

  it('does not consume a use when nothing can merge', () => {
    const s = stateWith(config, [{ cell: 0, chain: 'a', level: 1 }], { level: 10 });
    expect(applyAction(s, { type: 'auto_merge' }, ctx(config))).toEqual({ ok: false, error: 'nothing_to_merge' });
  });
});
