import { describe, expect, it } from 'vitest';
import { createInitialState, itemDef, validateConfig } from '@maw/engine';
import { gameConfig, visuals } from '../src';

describe('game content', () => {
  it('is a consistent configuration', () => {
    expect(validateConfig(gameConfig)).toEqual([]);
  });

  it('has a visual for every item, chain and task', () => {
    for (const chain of Object.values(gameConfig.chains)) {
      expect(visuals.chains[chain.id], chain.id).toBeDefined();
      for (const item of chain.items) expect(visuals.items[item.key], item.key).toBeDefined();
    }
    for (const chapter of Object.values(gameConfig.chapters)) {
      for (const task of chapter.tasks) expect(visuals.tasks[task.id], task.id).toBeDefined();
    }
  });

  it('builds a playable first chapter', () => {
    const state = createInitialState(gameConfig, { seed: 1, now: 0 });
    expect(state.board.cells).toHaveLength(63);
    const freeGenerators = state.board.cells.filter(
      (c) => c.item && !c.blocker && itemDef(gameConfig, c.item.chain, c.item.level).generator
    );
    expect(freeGenerators.length).toBeGreaterThan(0);
    expect(state.orders.every(Boolean)).toBe(true);
  });
});
