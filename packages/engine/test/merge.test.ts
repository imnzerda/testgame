import { describe, expect, it } from 'vitest';
import { applyAction, findMergePartner, resolveDrop } from '../src';
import { boardOf, ctx, itemAt, stateWith, testConfig } from './fixtures';

const config = testConfig();

function ok(result: ReturnType<typeof applyAction>) {
  if (!result.ok) throw new Error(`Expected success, got ${result.error}`);
  return result;
}

describe('merge', () => {
  it('merges two identical items into the next level on the target cell', () => {
    const s = stateWith(config, [
      { cell: 5, chain: 'a', level: 1 },
      { cell: 10, chain: 'a', level: 1 }
    ]);
    const r = ok(applyAction(s, { type: 'merge', from: 5, to: 10 }, ctx(config)));
    expect(itemAt(r.state, 10)).toBe('a2');
    expect(itemAt(r.state, 5)).toBeNull();
    expect(r.events[0]).toMatchObject({ type: 'merged', kind: 'merge', inputs: [5, 10] });
  });

  it('never mutates the previous state', () => {
    const s = stateWith(config, [
      { cell: 0, chain: 'a', level: 1 },
      { cell: 1, chain: 'a', level: 1 }
    ]);
    const snapshot = JSON.stringify(s);
    applyAction(s, { type: 'merge', from: 0, to: 1 }, ctx(config));
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('refuses different items, max level items and empty targets', () => {
    const s = stateWith(config, [
      { cell: 0, chain: 'a', level: 1 },
      { cell: 1, chain: 'b', level: 1 },
      { cell: 2, chain: 'a', level: 4 },
      { cell: 3, chain: 'a', level: 4 }
    ]);
    expect(applyAction(s, { type: 'merge', from: 0, to: 1 }, ctx(config))).toEqual({ ok: false, error: 'cannot_merge' });
    expect(applyAction(s, { type: 'merge', from: 2, to: 3 }, ctx(config))).toEqual({ ok: false, error: 'cannot_merge' });
    expect(applyAction(s, { type: 'merge', from: 0, to: 4 }, ctx(config))).toEqual({ ok: false, error: 'empty_cell' });
    expect(applyAction(s, { type: 'merge', from: 0, to: 0 }, ctx(config))).toEqual({ ok: false, error: 'same_cell' });
    expect(applyAction(s, { type: 'merge', from: 0, to: 99 }, ctx(config))).toEqual({ ok: false, error: 'invalid_cell' });
  });

  it('merging onto a web frees it, merging next to a box frees and reveals it', () => {
    const s = stateWith(config, [
      { cell: 0, chain: 'a', level: 1 },
      { cell: 5, chain: 'a', level: 1, blocker: 'web' },
      { cell: 9, chain: 'b', level: 2, blocker: 'box' },
      { cell: 15, chain: 'b', level: 1, blocker: 'web' }
    ]);
    const r = ok(applyAction(s, { type: 'merge', from: 0, to: 5 }, ctx(config)));
    expect(itemAt(r.state, 5)).toBe('a2');
    expect(r.state.board.cells[5]!.blocker).toBeNull();
    expect(r.state.board.cells[9]!.blocker).toBeNull();
    expect(r.state.board.cells[15]!.blocker).toBe('web');
    expect(r.events.filter((e) => e.type === 'unblocked')).toHaveLength(2);
  });

  it('cannot merge onto a box nor drag a blocked item', () => {
    const s = stateWith(config, [
      { cell: 0, chain: 'a', level: 1 },
      { cell: 1, chain: 'a', level: 1, blocker: 'box' },
      { cell: 2, chain: 'a', level: 1, blocker: 'web' }
    ]);
    expect(applyAction(s, { type: 'merge', from: 0, to: 1 }, ctx(config))).toEqual({ ok: false, error: 'blocked' });
    expect(applyAction(s, { type: 'merge', from: 2, to: 0 }, ctx(config))).toEqual({ ok: false, error: 'blocked' });
  });

  it('merges generators into a higher-level generator with full charges', () => {
    const s = stateWith(config, [
      { cell: 0, chain: 'gen', level: 1 },
      { cell: 1, chain: 'gen', level: 1 }
    ]);
    const r = ok(applyAction(s, { type: 'merge', from: 0, to: 1 }, ctx(config)));
    expect(r.state.board.cells[1]!.item).toMatchObject({ chain: 'gen', level: 2, gen: { charges: 2, rechargeAt: null } });
  });
});

describe('move', () => {
  it('moves to an empty cell and swaps with a different item', () => {
    const s = stateWith(config, [
      { cell: 0, chain: 'a', level: 1 },
      { cell: 1, chain: 'b', level: 1 }
    ]);
    const moved = ok(applyAction(s, { type: 'move', from: 0, to: 6 }, ctx(config)));
    expect(boardOf(moved.state)[6]).toBe('a1');
    expect(boardOf(moved.state)[0]).toBeNull();
    const swapped = ok(applyAction(s, { type: 'move', from: 0, to: 1 }, ctx(config)));
    expect(itemAt(swapped.state, 0)).toBe('b1');
    expect(itemAt(swapped.state, 1)).toBe('a1');
  });

  it('cannot move onto blocked cells', () => {
    const s = stateWith(config, [
      { cell: 0, chain: 'a', level: 1 },
      { cell: 1, chain: 'b', level: 1, blocker: 'web' }
    ]);
    expect(applyAction(s, { type: 'move', from: 0, to: 1 }, ctx(config))).toEqual({ ok: false, error: 'blocked' });
  });
});

describe('merge5', () => {
  // Row 0: a1 a1 a1 .   / Row 1: a1 . . .  / source a1 at cell 15
  const cells = [
    { cell: 0, chain: 'a', level: 1 },
    { cell: 1, chain: 'a', level: 1 },
    { cell: 2, chain: 'a', level: 1 },
    { cell: 4, chain: 'a', level: 1 },
    { cell: 15, chain: 'a', level: 1 }
  ];

  it('turns 5 identical items into 3 of the next level', () => {
    const s = stateWith(config, cells);
    const r = ok(applyAction(s, { type: 'merge5', from: 15, to: 1 }, ctx(config)));
    const board = boardOf(r.state);
    expect(board.filter((c) => c === 'a2')).toHaveLength(3);
    expect(board.filter((c) => c === 'a1')).toHaveLength(0);
    expect(itemAt(r.state, 1)).toBe('a2');
    expect(itemAt(r.state, 15)).toBeNull();
  });

  it('fails when the connected group is too small', () => {
    const s = stateWith(config, cells.filter((c) => c.cell !== 4));
    expect(applyAction(s, { type: 'merge5', from: 15, to: 1 }, ctx(config))).toEqual({
      ok: false,
      error: 'group_too_small'
    });
  });

  it('ignores pinned items when building the group', () => {
    const s = stateWith(
      config,
      cells.map((c) => (c.cell === 4 ? { ...c, pinned: true } : c))
    );
    expect(applyAction(s, { type: 'merge5', from: 15, to: 1 }, ctx(config)).ok).toBe(false);
  });

  it('resolveDrop picks merge5 when possible, merge otherwise', () => {
    const s = stateWith(config, cells);
    expect(resolveDrop(s, config, 15, 1)).toEqual({ type: 'merge5', from: 15, to: 1 });
    const small = stateWith(config, cells.slice(1));
    expect(resolveDrop(small, config, 15, 1)).toEqual({ type: 'merge', from: 15, to: 1 });
  });

  it('is never chosen when it would not beat pair merges (5 -> 2)', () => {
    const literal = testConfig({ merge5: { enabled: true, inputs: 5, outputs: 2 } });
    const s = stateWith(literal, cells);
    expect(resolveDrop(s, literal, 15, 1)).toEqual({ type: 'merge', from: 15, to: 1 });
  });

  it('resolveDrop handles moves, swaps and blocked targets', () => {
    const s = stateWith(config, [
      { cell: 0, chain: 'a', level: 1 },
      { cell: 1, chain: 'b', level: 1 },
      { cell: 2, chain: 'b', level: 1, blocker: 'web' },
      { cell: 3, chain: 'a', level: 1, blocker: 'box' }
    ]);
    expect(resolveDrop(s, config, 0, 5)).toEqual({ type: 'move', from: 0, to: 5 });
    expect(resolveDrop(s, config, 0, 1)).toEqual({ type: 'move', from: 0, to: 1 });
    expect(resolveDrop(s, config, 1, 2)).toEqual({ type: 'merge', from: 1, to: 2 });
    expect(resolveDrop(s, config, 0, 3)).toBeNull();
    expect(resolveDrop(s, config, 2, 1)).toBeNull();
  });
});

describe('findMergePartner (double tap)', () => {
  it('returns the closest identical free item, ties broken by index', () => {
    const s = stateWith(config, [
      { cell: 5, chain: 'a', level: 1 },
      { cell: 1, chain: 'a', level: 1 },
      { cell: 4, chain: 'a', level: 1 },
      { cell: 15, chain: 'a', level: 1 },
      { cell: 6, chain: 'b', level: 1 }
    ]);
    expect(findMergePartner(s, config, 5)).toBe(1);
    expect(findMergePartner(s, config, 15)).toBe(5);
  });

  it('skips pinned and blocked partners, and refuses max level or boxed targets', () => {
    const s = stateWith(config, [
      { cell: 0, chain: 'a', level: 1 },
      { cell: 1, chain: 'a', level: 1, pinned: true },
      { cell: 2, chain: 'a', level: 1, blocker: 'web' },
      { cell: 8, chain: 'a', level: 1 },
      { cell: 10, chain: 'a', level: 4 },
      { cell: 11, chain: 'a', level: 4 },
      { cell: 12, chain: 'b', level: 1, blocker: 'box' },
      { cell: 13, chain: 'b', level: 1 }
    ]);
    expect(findMergePartner(s, config, 0)).toBe(8);
    expect(findMergePartner(s, config, 2)).toBe(0); // a web target can receive a merge
    expect(findMergePartner(s, config, 10)).toBeNull();
    expect(findMergePartner(s, config, 12)).toBeNull();
    expect(findMergePartner(s, config, 13)).toBeNull();
  });
});
