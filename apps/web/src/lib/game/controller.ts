import {
  applyAction,
  cellAt,
  createInitialState,
  findMergePartner,
  isGenerator,
  resolveDrop,
  type Action,
  type ActionError,
  type CellIndex,
  type Entitlements,
  type GameConfig,
  type GameEvent,
  type GameState
} from '@maw/engine';
import { get, writable } from 'svelte/store';
import { track } from '$lib/analytics';
import { clearSave, loadState, saveState } from './persistence';

export interface Toast {
  id: number;
  key: string;
  params?: Record<string, string | number>;
  kind: 'error' | 'info' | 'success';
}

/** What the controller needs from the board renderer. */
export interface BoardView {
  play(events: GameEvent[], state: GameState, opts: { cascade: boolean }): void;
  sync(state: GameState): void;
  setSelected(cell: CellIndex | null): void;
}

export type DropTarget = CellIndex | 'recycle' | null;

/** Two taps on the same cell within this delay count as a double tap. */
const DOUBLE_TAP_MS = 350;

/** Errors that only mean "nothing happened" and deserve no toast. */
const SILENT_ERRORS: ActionError[] = ['same_cell', 'empty_cell', 'invalid_cell'];
const KNOWN_ERRORS: ActionError[] = [
  'no_energy',
  'board_full',
  'generator_cooldown',
  'blocked',
  'cannot_merge',
  'not_sellable',
  'order_incomplete',
  'not_enough_coins',
  'task_locked',
  'auto_merge_locked',
  'auto_merge_exhausted',
  'nothing_to_merge'
];

/**
 * Glue between UI, renderer and the pure engine. It holds no game rules: every state
 * change goes through `applyAction` (the same reducer the server will run).
 */
export class GameController {
  readonly game;
  readonly selected = writable<CellIndex | null>(null);
  readonly toast = writable<Toast | null>(null);
  readonly busy = writable(false);
  readonly entitlements: Entitlements = {};
  private view: BoardView | null = null;
  private toastId = 0;
  private lastTap: { cell: CellIndex; at: number } | null = null;

  constructor(readonly config: GameConfig, initial: GameState) {
    this.game = writable(initial);
    this.selected.subscribe((cell) => this.view?.setSelected(cell));
  }

  static load(config: GameConfig): GameController {
    const saved = loadState(config);
    const state = saved ?? createInitialState(config, { seed: randomSeed(), now: Date.now() });
    if (!saved) saveState(state);
    track('session_start', { newPlayer: !saved, level: state.level });
    return new GameController(config, state);
  }

  get state(): GameState {
    return get(this.game);
  }

  attachView(view: BoardView): void {
    this.view = view;
    view.sync(this.state);
    view.setSelected(get(this.selected));
  }

  detachView(): void {
    this.view = null;
  }

  dispatch(action: Action): boolean {
    if (get(this.busy)) return false;
    const result = applyAction(this.state, action, {
      config: this.config,
      now: Date.now(),
      entitlements: this.entitlements
    });
    if (!result.ok) {
      this.showError(result.error);
      track('action_rejected', { action: action.type, error: result.error });
      return false;
    }
    this.game.set(result.state);
    saveState(result.state);
    this.view?.play(result.events, result.state, { cascade: action.type === 'auto_merge' });
    this.report(result.events);
    this.validateSelection();
    return true;
  }

  // ---- Board input (drag & drop and tap-tap) ----

  tap(cell: CellIndex): void {
    const board = this.state.board;
    const target = cellAt(board, cell);
    const selectable = !!target.item && target.blocker !== 'box';
    const sel = get(this.selected);

    const at = performance.now();
    const isDouble = this.lastTap?.cell === cell && at - this.lastTap.at < DOUBLE_TAP_MS;
    this.lastTap = isDouble ? null : { cell, at };
    // Double tap on an item: merge the closest identical item onto it.
    // (Generators keep their own behaviour: second tap produces.)
    if (isDouble && target.item && target.blocker !== 'box' && !isGenerator(this.config, target.item)) {
      this.mergeWithClosest(cell);
      return;
    }

    if (sel === null) {
      this.selected.set(selectable ? cell : null);
      return;
    }
    if (sel === cell) {
      if (target.item && !target.blocker && isGenerator(this.config, target.item)) {
        this.dispatch({ type: 'generate', cell });
      } else {
        this.selected.set(null);
      }
      return;
    }
    const source = cellAt(board, sel);
    if (!source.item || source.blocker) {
      this.selected.set(selectable ? cell : null);
      return;
    }
    const action = resolveDrop(this.state, this.config, sel, cell);
    // Tap-tap: empty cell = move, identical item = merge, another item = change selection.
    if (action && (!target.item || action.type !== 'move')) {
      if (this.dispatch(action)) {
        this.selected.set(null);
        this.lastTap = null;
      }
      return;
    }
    this.selected.set(selectable ? cell : null);
  }

  mergeWithClosest(cell: CellIndex): void {
    const partner = findMergePartner(this.state, this.config, cell);
    const action = partner === null ? null : resolveDrop(this.state, this.config, partner, cell);
    if (!action || action.type === 'move') {
      this.selected.set(null);
      this.notify('error.no_partner', undefined, 'error');
      return;
    }
    if (this.dispatch(action)) this.selected.set(null);
  }

  drop(from: CellIndex, to: DropTarget): void {
    if (to === null || to === from) return;
    if (to === 'recycle') {
      this.dispatch({ type: 'sell', cell: from });
      return;
    }
    const action = resolveDrop(this.state, this.config, from, to);
    if (!action) {
      this.showError('blocked');
      return;
    }
    if (this.dispatch(action)) this.selected.set(null);
  }

  longPress(cell: CellIndex): void {
    const c = cellAt(this.state.board, cell);
    if (!c.item || c.blocker || isGenerator(this.config, c.item)) return;
    this.dispatch({ type: 'pin', cell });
  }

  tapRecycle(): void {
    const sel = get(this.selected);
    if (sel !== null && this.dispatch({ type: 'sell', cell: sel })) this.selected.set(null);
  }

  // ---- Buttons ----

  produceSelected(): void {
    const sel = get(this.selected);
    if (sel !== null) this.dispatch({ type: 'generate', cell: sel });
  }

  deliver(slot: number): void {
    this.dispatch({ type: 'deliver', slot });
  }

  renovate(taskId: string): void {
    this.dispatch({ type: 'renovate', taskId });
  }

  autoMerge(): void {
    this.selected.set(null);
    this.dispatch({ type: 'auto_merge' });
  }

  setProtectOrderItems(value: boolean): void {
    this.dispatch({ type: 'settings', settings: { protectOrderItems: value } });
  }

  reset(): void {
    clearSave();
    const state = createInitialState(this.config, { seed: randomSeed(), now: Date.now() });
    saveState(state);
    this.selected.set(null);
    this.game.set(state);
    this.view?.sync(state);
  }

  notify(key: string, params?: Record<string, string | number>, kind: Toast['kind'] = 'info'): void {
    this.toast.set({ id: ++this.toastId, key, params, kind });
  }

  // ---- Internals ----

  private showError(error: ActionError): void {
    if (SILENT_ERRORS.includes(error)) return;
    this.notify(KNOWN_ERRORS.includes(error) ? `error.${error}` : 'error.generic', undefined, 'error');
  }

  private validateSelection(): void {
    const sel = get(this.selected);
    if (sel === null) return;
    const cell = cellAt(this.state.board, sel);
    if (!cell.item || cell.blocker === 'box') this.selected.set(null);
  }

  private report(events: GameEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'spawned':
          track('generate', { chain: e.item.chain, level: e.item.level });
          break;
        case 'merged':
          if (e.kind !== 'auto') track('merge', { kind: e.kind, chain: e.outputs[0]?.item.chain, level: e.outputs[0]?.item.level });
          break;
        case 'energy_empty':
          track('energy_empty');
          break;
        case 'delivered':
          track('order_delivered', { reward: e.reward });
          if (e.reward.energy) this.notify('toast.reward_energy', { n: e.reward.energy }, 'success');
          if (e.reward.gems) this.notify('toast.reward_gems', { n: e.reward.gems }, 'success');
          break;
        case 'level_up':
          track('level_up', { level: e.level });
          this.notify('toast.level_up', { level: e.level }, 'success');
          break;
        case 'auto_merge_used':
          track('auto_merge_used', { steps: e.steps });
          break;
        case 'chapter_completed':
          track('chapter_completed', { chapter: e.chapterId });
          break;
      }
    }
  }
}

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}
