import { Application, Container, Graphics, Text, type FederatedPointerEvent, type PointData } from 'pixi.js';
import { cellAt, resolveDrop, sellValue, type BlockerKind, type CellIndex, type GameEvent, type GameState, type Item } from '@maw/engine';
import type { BoardView, DropTarget } from '$lib/game/controller';
import { EMOJI_FONT, ItemView, type ViewContext } from './ItemView';
import { easeOutBack, Tweens } from './tween';

export interface BoardInput {
  tap(cell: CellIndex): void;
  drop(from: CellIndex, to: DropTarget): void;
  longPress(cell: CellIndex): void;
  tapRecycle(): void;
}

export interface RendererOptions extends ViewContext {
  input: BoardInput;
  onBusy(busy: boolean): void;
  reducedMotion(): boolean;
}

interface Press {
  cell: CellIndex | null;
  recycle: boolean;
  start: PointData;
  view: ItemView | null;
  dragging: boolean;
  longPressed: boolean;
}

/** Spec: cells are at least 48px on touch screens; a mouse can aim at smaller ones. */
const MIN_CELL_TOUCH = 48;
const MIN_CELL_MOUSE = 32;
const MAX_CELL = 92;
const RECYCLE_ROWS = 1.3;
const CASCADE_STEP_MS = 150;
const DRAG_THRESHOLD = 8;
const LONG_PRESS_MS = 450;

export class BoardRenderer implements BoardView {
  private app = new Application();
  private ready = false;
  private laidOut = false;
  private destroyed = false;
  private state: GameState | null = null;
  private cs = 56;
  private host: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;

  private tiles = new Graphics();
  private selection = new Graphics();
  private hover = new Graphics();
  private items = new Container();
  private fx = new Container();
  private recycle = new Container();
  private recycleLabel = new Text({ text: '', style: { fontSize: 18, fontWeight: '800', fill: 0x2f6b2f } });

  private views = new Map<number, ItemView>();
  private tweens = new Tweens();
  private pendingSync = false;
  private cascading = false;
  private selectedCell: CellIndex | null = null;
  private press: Press | null = null;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly opts: RendererOptions) {}

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      width: 10,
      height: 10
    });
    if (this.destroyed) {
      this.app.destroy(true);
      return;
    }
    this.host = host;
    const canvas = this.app.canvas;
    canvas.style.touchAction = 'none';
    canvas.style.display = 'block';
    canvas.style.margin = 'auto';
    canvas.setAttribute('role', 'img');
    host.appendChild(canvas);

    this.items.sortableChildren = true;
    this.app.stage.addChild(this.tiles, this.selection, this.hover, this.items, this.fx, this.recycle);
    this.app.stage.eventMode = 'static';
    this.app.stage.on('pointerdown', this.onDown);
    this.app.stage.on('globalpointermove', this.onMove);
    this.app.stage.on('pointerup', this.onUp);
    this.app.stage.on('pointerupoutside', this.onUp);
    this.app.ticker.add((ticker) => this.tick(ticker.deltaMS));

    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(host);
    this.ready = true;
    this.layout();
  }

  destroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    if (this.longPressTimer) clearTimeout(this.longPressTimer);
    if (this.ready) this.app.destroy(true, { children: true });
    this.ready = false;
  }

  // ---- BoardView ----

  sync(state: GameState): void {
    this.state = state;
    if (!this.ready) return;
    if (!this.laidOut) return this.layout();
    const now = Date.now();
    const seen = new Set<number>();
    state.board.cells.forEach((cell, i) => {
      if (!cell.item) return;
      seen.add(cell.item.id);
      let view = this.views.get(cell.item.id);
      if (!view) view = this.createView(cell.item, cell.blocker, i);
      view.update(cell.item, cell.blocker, this.cs, this.opts, now);
      view.cell = i;
      const p = this.center(i);
      view.position.set(p.x, p.y);
      view.scale.set(1);
      view.alpha = 1;
      view.zIndex = 0;
    });
    for (const [id, view] of this.views) if (!seen.has(id)) this.removeView(view);
    this.drawSelection();
  }

  setSelected(cell: CellIndex | null): void {
    this.selectedCell = cell;
    this.drawSelection();
  }

  play(events: GameEvent[], state: GameState, opts: { cascade: boolean }): void {
    if (!this.ready) {
      this.state = state;
      return;
    }
    this.flush();
    const k = this.opts.reducedMotion() ? 0 : 1;
    const byCell = new Map<CellIndex, ItemView>();
    for (const v of this.views.values()) byCell.set(v.cell, v);
    let step = 0;

    for (const ev of events) {
      switch (ev.type) {
        case 'spawned': {
          const view = this.createView(ev.item, null, ev.from);
          view.scale.set(0.4);
          view.zIndex = 5;
          view.cell = ev.to;
          byCell.set(ev.to, view);
          this.tweens.add(view, { ...this.center(ev.to), scale: 1 }, 260 * k, { ease: easeOutBack });
          break;
        }
        case 'moved': {
          const view = byCell.get(ev.from);
          if (!view) break;
          byCell.delete(ev.from);
          view.cell = ev.to;
          byCell.set(ev.to, view);
          this.tweens.add(view, { ...this.center(ev.to), scale: 1 }, 140 * k);
          break;
        }
        case 'swapped': {
          const a = byCell.get(ev.a);
          const b = byCell.get(ev.b);
          if (a) {
            a.cell = ev.b;
            this.tweens.add(a, { ...this.center(ev.b), scale: 1 }, 160 * k);
          }
          if (b) {
            b.cell = ev.a;
            this.tweens.add(b, { ...this.center(ev.a), scale: 1 }, 160 * k);
          }
          if (a) byCell.set(ev.b, a);
          else byCell.delete(ev.b);
          if (b) byCell.set(ev.a, b);
          else byCell.delete(ev.a);
          break;
        }
        case 'merged': {
          const delay = opts.cascade ? step * CASCADE_STEP_MS * k : 0;
          step++;
          const target = this.center(ev.outputs[0]!.cell);
          for (const c of ev.inputs) {
            const view = byCell.get(c);
            if (!view) continue;
            byCell.delete(c);
            this.tweens.add(view, { ...target, alpha: 0.4, scale: 0.75 }, 110 * k, {
              delay,
              onDone: () => this.removeView(view)
            });
          }
          for (const out of ev.outputs) {
            const view = this.createView(out.item, null, out.cell);
            view.scale.set(0);
            byCell.set(out.cell, view);
            this.tweens.add(view, { scale: 1 }, 220 * k, {
              delay: delay + 100 * k,
              ease: easeOutBack,
              onStart: () => this.burst(out.cell, out.item)
            });
          }
          break;
        }
        case 'sold': {
          const view = byCell.get(ev.cell);
          if (!view) break;
          byCell.delete(ev.cell);
          this.tweens.add(view, { ...this.recycleCenter(), scale: 0.2, alpha: 0 }, 220 * k, {
            onDone: () => this.removeView(view)
          });
          break;
        }
        case 'delivered': {
          for (const c of ev.cells) {
            const view = byCell.get(c);
            if (!view) continue;
            byCell.delete(c);
            view.zIndex = 10;
            this.tweens.add(view, { y: view.y - this.cs * 2, alpha: 0, scale: 1.25 }, 380 * k, {
              onDone: () => this.removeView(view)
            });
          }
          break;
        }
        default:
          break;
      }
    }

    this.state = state;
    this.pendingSync = true;
    if (opts.cascade && step > 0 && k > 0) {
      this.cascading = true;
      this.opts.onBusy(true);
    }
    if (this.tweens.empty) this.finishBatch();
  }

  // ---- Layout ----

  private layout(): void {
    if (!this.ready || !this.host || !this.state) return;
    const { width, height } = this.state.board;
    const availW = this.host.clientWidth;
    const availH = this.host.clientHeight;
    const minCell = window.matchMedia('(pointer: coarse)').matches ? MIN_CELL_TOUCH : MIN_CELL_MOUSE;
    const cs = Math.max(minCell, Math.min(MAX_CELL, Math.floor(Math.min(availW / width, availH / (height + RECYCLE_ROWS)))));
    const w = width * cs;
    const h = Math.ceil((height + RECYCLE_ROWS) * cs);
    if (this.laidOut && cs === this.cs && this.app.screen.width === w && this.app.screen.height === h) return;
    this.laidOut = true;
    this.cs = cs;
    this.app.renderer.resize(w, h);
    this.app.stage.hitArea = this.app.screen;
    this.flush();
    this.drawTiles();
    this.drawRecycle();
    this.sync(this.state);
  }

  private drawTiles(): void {
    const { width, height } = this.state!.board;
    const cs = this.cs;
    const g = this.tiles.clear();
    g.roundRect(0, 0, width * cs, height * cs, cs * 0.18).fill({ color: 0xe9dcc0 });
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        g.roundRect(x * cs + 2, y * cs + 2, cs - 4, cs - 4, cs * 0.14).fill({
          color: (x + y) % 2 === 0 ? 0xfdf6e3 : 0xf6ebcf
        });
      }
    }
  }

  private recycleRect() {
    const { width, height } = this.state!.board;
    const cs = this.cs;
    const w = Math.min(width * cs, cs * 4);
    return { x: (width * cs - w) / 2, y: height * cs + cs * 0.18, w, h: cs * (RECYCLE_ROWS - 0.3) };
  }

  private recycleCenter(): PointData {
    const r = this.recycleRect();
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }

  private drawRecycle(active = false, value: number | null = null): void {
    const r = this.recycleRect();
    for (const child of this.recycle.removeChildren()) {
      if (child !== this.recycleLabel) child.destroy({ children: true });
    }
    const bg = new Graphics()
      .roundRect(r.x, r.y, r.w, r.h, r.h / 2)
      .fill({ color: active ? 0xc8efc8 : 0xe6f2e6 })
      .stroke({ width: active ? 3 : 2, color: active ? 0x2f8f2f : 0x9cc79c });
    const icon = new Text({ text: '♻️', style: { fontSize: r.h * 0.6, fontFamily: EMOJI_FONT } });
    icon.anchor.set(0.5);
    icon.position.set(r.x + r.w / 2 - (value !== null ? r.h * 0.5 : 0), r.y + r.h / 2);
    this.recycle.addChild(bg, icon);
    if (value !== null) {
      this.recycleLabel.text = `+${value} 🪙`;
      this.recycleLabel.style.fontSize = r.h * 0.38;
      this.recycleLabel.anchor.set(0, 0.5);
      this.recycleLabel.position.set(r.x + r.w / 2 + r.h * 0.05, r.y + r.h / 2);
      this.recycle.addChild(this.recycleLabel);
    }
  }

  private drawSelection(): void {
    const g = this.selection.clear();
    if (!this.ready || this.selectedCell === null || !this.state) return;
    const { x, y } = this.topLeft(this.selectedCell);
    g.roundRect(x + 2, y + 2, this.cs - 4, this.cs - 4, this.cs * 0.14)
      .fill({ color: 0xffe08a, alpha: 0.6 })
      .stroke({ width: 3, color: 0xe0a400 });
  }

  private drawHover(target: DropTarget, from: CellIndex): void {
    const g = this.hover.clear();
    const state = this.state!;
    if (target === 'recycle') {
      const item = cellAt(state.board, from).item;
      this.drawRecycle(true, item ? sellValue(this.opts.config, item) : null);
      return;
    }
    this.drawRecycle(false);
    if (target === null || target === from) return;
    const action = resolveDrop(state, this.opts.config, from, target);
    const { x, y } = this.topLeft(target);
    const color = !action ? 0xd9534f : action.type === 'move' ? 0x5b8def : 0x2fbf71;
    g.roundRect(x + 2, y + 2, this.cs - 4, this.cs - 4, this.cs * 0.14).stroke({ width: 4, color });
  }

  // ---- Geometry ----

  private topLeft(cell: CellIndex): PointData {
    const w = this.state!.board.width;
    return { x: (cell % w) * this.cs, y: Math.floor(cell / w) * this.cs };
  }

  private center(cell: CellIndex): { x: number; y: number } {
    const p = this.topLeft(cell);
    return { x: p.x + this.cs / 2, y: p.y + this.cs / 2 };
  }

  private cellAtPoint(p: PointData): CellIndex | null {
    const { width, height } = this.state!.board;
    const x = Math.floor(p.x / this.cs);
    const y = Math.floor(p.y / this.cs);
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    return y * width + x;
  }

  private inRecycle(p: PointData): boolean {
    const r = this.recycleRect();
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  // ---- Views & effects ----

  private createView(item: Item, blocker: BlockerKind | null, cell: CellIndex): ItemView {
    const view = new ItemView(item, blocker, cell, this.cs, this.opts);
    const p = this.center(cell);
    view.position.set(p.x, p.y);
    this.views.set(item.id, view);
    this.items.addChild(view);
    return view;
  }

  private removeView(view: ItemView): void {
    if (this.views.get(view.itemId) === view) this.views.delete(view.itemId);
    if (!view.destroyed) view.destroy({ children: true });
  }

  private burst(cell: CellIndex, item: Item): void {
    if (this.opts.reducedMotion()) return;
    const c = this.center(cell);
    const color = this.opts.visuals.chains[item.chain]?.outline ?? '#ffffff';
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i;
      const dot = new Graphics().circle(0, 0, this.cs * 0.06).fill({ color });
      dot.position.set(c.x, c.y);
      this.fx.addChild(dot);
      this.tweens.add(
        dot,
        { x: c.x + Math.cos(a) * this.cs * 0.6, y: c.y + Math.sin(a) * this.cs * 0.6, alpha: 0, scale: 0.4 },
        320,
        { onDone: () => dot.destroy() }
      );
    }
  }

  private tick(dt: number): void {
    this.tweens.update(dt);
    if (this.tweens.empty && this.pendingSync) this.finishBatch();
  }

  /** Completes running animations and snaps the board to the latest state. */
  private flush(): void {
    this.tweens.finishAll();
    if (this.pendingSync) this.finishBatch();
  }

  private finishBatch(): void {
    this.pendingSync = false;
    for (const child of this.fx.removeChildren()) child.destroy();
    if (this.state) this.sync(this.state);
    if (this.cascading) {
      this.cascading = false;
      this.opts.onBusy(false);
    }
  }

  // ---- Input ----

  private onDown = (e: FederatedPointerEvent): void => {
    if (this.cascading || !this.state) return;
    this.flush();
    const p = { x: e.global.x, y: e.global.y };
    const cell = this.cellAtPoint(p);
    const recycle = cell === null && this.inRecycle(p);
    if (cell === null && !recycle) return;
    let view: ItemView | null = null;
    if (cell !== null) {
      const c = cellAt(this.state.board, cell);
      if (c.item && !c.blocker) view = this.views.get(c.item.id) ?? null;
    }
    this.press = { cell, recycle, start: p, view, dragging: false, longPressed: false };
    if (view && cell !== null) {
      this.longPressTimer = setTimeout(() => {
        if (this.press && !this.press.dragging) {
          this.press.longPressed = true;
          this.opts.input.longPress(cell);
        }
      }, LONG_PRESS_MS);
    }
  };

  private onMove = (e: FederatedPointerEvent): void => {
    const press = this.press;
    if (!press || !press.view || press.cell === null) return;
    const p = e.global;
    if (!press.dragging) {
      if (Math.hypot(p.x - press.start.x, p.y - press.start.y) < DRAG_THRESHOLD || press.longPressed) return;
      press.dragging = true;
      this.clearLongPress();
      press.view.zIndex = 100;
      press.view.scale.set(1.12);
    }
    press.view.position.set(p.x, p.y);
    const target = this.cellAtPoint(p) ?? (this.inRecycle(p) ? 'recycle' : null);
    this.drawHover(target, press.cell);
  };

  private onUp = (e: FederatedPointerEvent): void => {
    this.clearLongPress();
    const press = this.press;
    this.press = null;
    if (!press || !this.state) return;
    this.hover.clear();

    if (press.dragging && press.view && press.cell !== null) {
      this.drawRecycle(false);
      const view = press.view;
      const p = e.global;
      const target = this.cellAtPoint(p) ?? (this.inRecycle(p) ? 'recycle' : null);
      const before = this.state;
      this.opts.input.drop(press.cell, target);
      if (this.state === before && !view.destroyed) {
        // Rejected or no-op: fly back home.
        view.zIndex = 0;
        this.tweens.add(view, { ...this.center(press.cell), scale: 1 }, 160);
      }
      return;
    }
    if (press.longPressed) return;
    if (press.recycle) this.opts.input.tapRecycle();
    else if (press.cell !== null) this.opts.input.tap(press.cell);
  };

  private clearLongPress(): void {
    if (this.longPressTimer) clearTimeout(this.longPressTimer);
    this.longPressTimer = null;
  }
}
