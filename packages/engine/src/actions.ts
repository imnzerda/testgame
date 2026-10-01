import { runAutoMerge } from './autoMerge';
import { cellAt, findEmptyNear, isGenerator, isValidCell, sameKind } from './board';
import { chainDef, generatorSpec, maxLevel, type GameConfig } from './config';
import { settleEnergy } from './energy';
import type { GameEvent } from './events';
import { createItem, refreshCharges } from './items';
import { canMergeItems, isMerge5Beneficial, merge5Group, performMerge } from './merge';
import { currentChapter, generateOrder, matchOrder } from './orders';
import { addXp, dayKey } from './progression';
import { Rng } from './rng';
import type { CellIndex, Entitlements, GameState, PlayerSettings } from './types';

export type Action =
  | { type: 'generate'; cell: CellIndex }
  | { type: 'move'; from: CellIndex; to: CellIndex }
  | { type: 'merge'; from: CellIndex; to: CellIndex }
  | { type: 'merge5'; from: CellIndex; to: CellIndex }
  | { type: 'auto_merge' }
  | { type: 'sell'; cell: CellIndex }
  | { type: 'deliver'; slot: number }
  | { type: 'renovate'; taskId: string }
  | { type: 'pin'; cell: CellIndex }
  | { type: 'settings'; settings: Partial<PlayerSettings> };

export type ActionError =
  | 'invalid_cell'
  | 'same_cell'
  | 'empty_cell'
  | 'blocked'
  | 'not_generator'
  | 'no_energy'
  | 'generator_cooldown'
  | 'board_full'
  | 'cannot_merge'
  | 'group_too_small'
  | 'not_sellable'
  | 'no_order'
  | 'order_incomplete'
  | 'unknown_task'
  | 'task_done'
  | 'task_locked'
  | 'not_enough_coins'
  | 'auto_merge_locked'
  | 'auto_merge_exhausted'
  | 'nothing_to_merge'
  | 'unknown_action';

export interface ApplyContext {
  config: GameConfig;
  now: number;
  entitlements?: Entitlements;
}

export type ApplyResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: ActionError };

class ActionFailure extends Error {
  constructor(readonly code: ActionError) {
    super(code);
  }
}

function fail(code: ActionError): never {
  throw new ActionFailure(code);
}

/**
 * Pure reducer shared by client (optimistic) and server (authoritative).
 * Never mutates `prev`.
 */
export function applyAction(prev: GameState, action: Action, ctx: ApplyContext): ApplyResult {
  const state = structuredClone(prev);
  const events: GameEvent[] = [];
  const rng = new Rng(state.rng);
  settleEnergy(state, ctx.config.balance, ctx.now);
  try {
    handle(state, action, ctx, rng, events);
  } catch (e) {
    if (e instanceof ActionFailure) return { ok: false, error: e.code };
    throw e;
  }
  state.rng = rng.seed;
  return { ok: true, state, events };
}

function handle(state: GameState, action: Action, ctx: ApplyContext, rng: Rng, events: GameEvent[]): void {
  const { config } = ctx;
  switch (action.type) {
    case 'generate':
      return generate(state, ctx, action.cell, rng, events);
    case 'move':
      return move(state, config, action.from, action.to, events);
    case 'merge':
      return merge(state, config, action.from, action.to, events);
    case 'merge5':
      return merge5(state, config, action.from, action.to, events);
    case 'auto_merge':
      return autoMerge(state, ctx, events);
    case 'sell':
      return sell(state, config, action.cell, events);
    case 'deliver':
      return deliver(state, config, action.slot, rng, events);
    case 'renovate':
      return renovate(state, config, action.taskId, events);
    case 'pin':
      return pin(state, config, action.cell, events);
    case 'settings':
      if (typeof action.settings.protectOrderItems === 'boolean') {
        state.settings.protectOrderItems = action.settings.protectOrderItems;
      }
      return;
    default:
      fail('unknown_action');
  }
}

function requireFreeItem(state: GameState, cell: CellIndex) {
  if (!isValidCell(state.board, cell)) fail('invalid_cell');
  const c = cellAt(state.board, cell);
  if (!c.item) fail('empty_cell');
  if (c.blocker) fail('blocked');
  return c.item;
}

function generate(state: GameState, ctx: ApplyContext, cell: CellIndex, rng: Rng, events: GameEvent[]): void {
  const { config, now } = ctx;
  const item = requireFreeItem(state, cell);
  const spec = generatorSpec(config, item.chain, item.level);
  if (!spec) fail('not_generator');
  const cost = config.balance.energy.costPerGenerate;
  if (state.energy < cost) fail('no_energy');
  refreshCharges(item, config, now);
  if (item.gen && item.gen.charges <= 0) fail('generator_cooldown');
  const target = findEmptyNear(state.board, cell);
  if (target === null) fail('board_full');

  const product = rng.pickWeighted(spec.produces);
  const created = createItem(state, config, product.chain, product.level);
  cellAt(state.board, target).item = created;
  state.energy -= cost;
  if (item.gen) {
    item.gen.charges -= 1;
    if (item.gen.charges <= 0) item.gen.rechargeAt = now + spec.cooldownSec * 1000;
  }
  events.push({ type: 'spawned', from: cell, to: target, item: created });
  if (state.energy < cost) events.push({ type: 'energy_empty' });
}

function move(state: GameState, config: GameConfig, from: CellIndex, to: CellIndex, events: GameEvent[]): void {
  const item = requireFreeItem(state, from);
  if (!isValidCell(state.board, to)) fail('invalid_cell');
  if (from === to) fail('same_cell');
  const dst = cellAt(state.board, to);
  if (dst.blocker) fail('blocked');
  const src = cellAt(state.board, from);
  if (!dst.item) {
    dst.item = item;
    src.item = null;
    events.push({ type: 'moved', from, to });
    return;
  }
  // Identical mergeable items must be merged, not swapped.
  if (canMergeItems(config, item, dst.item)) fail('cannot_merge');
  src.item = dst.item;
  dst.item = item;
  events.push({ type: 'swapped', a: from, b: to });
}

function checkMergePair(state: GameState, config: GameConfig, from: CellIndex, to: CellIndex) {
  const item = requireFreeItem(state, from);
  if (!isValidCell(state.board, to)) fail('invalid_cell');
  if (from === to) fail('same_cell');
  const dst = cellAt(state.board, to);
  if (!dst.item) fail('empty_cell');
  if (dst.blocker === 'box') fail('blocked');
  if (!canMergeItems(config, item, dst.item)) fail('cannot_merge');
  return dst;
}

function merge(state: GameState, config: GameConfig, from: CellIndex, to: CellIndex, events: GameEvent[]): void {
  checkMergePair(state, config, from, to);
  performMerge(state, config, [from, to], [to], 'merge', events);
}

function merge5(state: GameState, config: GameConfig, from: CellIndex, to: CellIndex, events: GameEvent[]): void {
  if (!config.balance.merge5.enabled) fail('cannot_merge');
  const dst = checkMergePair(state, config, from, to);
  if (dst.blocker) fail('blocked');
  const group = merge5Group(state.board, config, from, to);
  if (!group) fail('group_too_small');
  const outputs = group.slice(0, config.balance.merge5.outputs);
  performMerge(state, config, [from, ...group], outputs, 'merge5', events);
}

function autoMerge(state: GameState, ctx: ApplyContext, events: GameEvent[]): void {
  const { config, now } = ctx;
  const rules = config.balance.autoMerge;
  const unlimited = !!ctx.entitlements?.unlimitedAutoMerge;
  const today = dayKey(now);
  if (state.autoMerge.day !== today) state.autoMerge = { day: today, uses: 0 };
  if (!unlimited) {
    if (state.level < rules.unlockLevel) fail('auto_merge_locked');
    if (state.autoMerge.uses >= rules.dailyUses) fail('auto_merge_exhausted');
  }
  const steps = runAutoMerge(state, config, events);
  if (steps === 0) fail('nothing_to_merge');
  state.autoMerge.uses += 1;
  events.push({ type: 'auto_merge_used', steps });
}

function sell(state: GameState, config: GameConfig, cell: CellIndex, events: GameEvent[]): void {
  const item = requireFreeItem(state, cell);
  if (isGenerator(config, item)) fail('not_sellable');
  const coins = chainDef(config, item.chain).sellValue[item.level - 1] ?? 0;
  cellAt(state.board, cell).item = null;
  state.coins += coins;
  events.push({ type: 'sold', cell, coins });
}

function deliver(state: GameState, config: GameConfig, slot: number, rng: Rng, events: GameEvent[]): void {
  const order = state.orders[slot];
  if (!order) fail('no_order');
  const cells = matchOrder(state.board, order.requirements);
  if (cells.some((c) => c === null)) fail('order_incomplete');
  const used = cells as CellIndex[];
  for (const c of used) cellAt(state.board, c).item = null;

  const reward = order.reward;
  state.coins += reward.coins;
  state.gems += reward.gems ?? 0;
  state.energy += reward.energy ?? 0;
  events.push({ type: 'delivered', slot, cells: used, reward });
  addXp(state, config.balance, reward.xp, events);

  const next = generateOrder(state, config, rng);
  state.orders[slot] = next;
  events.push({ type: 'order_created', slot, order: next });
}

function renovate(state: GameState, config: GameConfig, taskId: string, events: GameEvent[]): void {
  const chapter = currentChapter(state, config);
  const task = chapter.tasks.find((t) => t.id === taskId);
  if (!task) fail('unknown_task');
  if (state.tasksDone.includes(taskId)) fail('task_done');
  if (!task.requires.every((r) => state.tasksDone.includes(r))) fail('task_locked');
  if (state.coins < task.cost) fail('not_enough_coins');
  state.coins -= task.cost;
  state.tasksDone.push(taskId);
  events.push({ type: 'renovated', taskId });
  addXp(state, config.balance, task.xp, events);
  if (!state.chapterCompleted && chapter.tasks.every((t) => state.tasksDone.includes(t.id))) {
    state.chapterCompleted = true;
    events.push({ type: 'chapter_completed', chapterId: chapter.id });
  }
}

function pin(state: GameState, config: GameConfig, cell: CellIndex, events: GameEvent[]): void {
  const item = requireFreeItem(state, cell);
  if (isGenerator(config, item) || item.level >= maxLevel(config, item.chain)) fail('cannot_merge');
  item.pinned = !item.pinned;
  if (!item.pinned) delete item.pinned;
  events.push({ type: 'pinned', cell, pinned: !!item.pinned });
}

/** Picks the right action for a drag from `from` onto `to` (null if nothing can happen). */
export function resolveDrop(state: GameState, config: GameConfig, from: CellIndex, to: CellIndex): Action | null {
  if (from === to || !isValidCell(state.board, from) || !isValidCell(state.board, to)) return null;
  const src = cellAt(state.board, from);
  const dst = cellAt(state.board, to);
  if (!src.item || src.blocker) return null;
  if (!dst.item) return dst.blocker ? null : { type: 'move', from, to };
  if (dst.blocker !== 'box' && sameKind(src.item, dst.item)) {
    if (!canMergeItems(config, src.item, dst.item)) return dst.blocker ? null : { type: 'move', from, to };
    if (!dst.blocker && isMerge5Beneficial(config) && merge5Group(state.board, config, from, to)) {
      return { type: 'merge5', from, to };
    }
    return { type: 'merge', from, to };
  }
  return dst.blocker ? null : { type: 'move', from, to };
}
