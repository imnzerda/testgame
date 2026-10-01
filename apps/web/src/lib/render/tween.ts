import type { Container } from 'pixi.js';

type Prop = 'x' | 'y' | 'alpha' | 'scale' | 'rotation';
export type TweenProps = Partial<Record<Prop, number>>;
export type Ease = (t: number) => number;

export const easeOutCubic: Ease = (t) => 1 - (1 - t) ** 3;
export const easeOutBack: Ease = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

interface Tween {
  target: Container;
  to: TweenProps;
  from: TweenProps;
  duration: number;
  delay: number;
  elapsed: number;
  ease: Ease;
  started: boolean;
  onStart?: () => void;
  onDone?: () => void;
}

export interface TweenOptions {
  delay?: number;
  ease?: Ease;
  onStart?: () => void;
  onDone?: () => void;
}

function read(target: Container, prop: Prop): number {
  return prop === 'scale' ? target.scale.x : target[prop];
}

function write(target: Container, prop: Prop, value: number): void {
  if (prop === 'scale') target.scale.set(value);
  else target[prop] = value;
}

/**
 * Minimal tween engine driven by the Pixi ticker. `finishAll` jumps every tween to its
 * end synchronously (in end-time order) so a new action never races with old animations.
 */
export class Tweens {
  private list: Tween[] = [];

  get empty(): boolean {
    return this.list.length === 0;
  }

  add(target: Container, to: TweenProps, duration: number, opts: TweenOptions = {}): void {
    this.list.push({
      target,
      to,
      from: {},
      duration: Math.max(0, duration),
      delay: Math.max(0, opts.delay ?? 0),
      elapsed: 0,
      ease: opts.ease ?? easeOutCubic,
      started: false,
      onStart: opts.onStart,
      onDone: opts.onDone
    });
  }

  update(dt: number): void {
    for (const tween of [...this.list]) {
      if (!this.list.includes(tween)) continue;
      tween.elapsed += dt;
      if (tween.elapsed < tween.delay) continue;
      if (!tween.started) this.start(tween);
      if (tween.target.destroyed) {
        this.remove(tween);
        continue;
      }
      const p = tween.duration === 0 ? 1 : Math.min(1, (tween.elapsed - tween.delay) / tween.duration);
      const k = tween.ease(p);
      for (const prop of Object.keys(tween.to) as Prop[]) {
        const from = tween.from[prop]!;
        write(tween.target, prop, from + (tween.to[prop]! - from) * k);
      }
      if (p >= 1) {
        this.remove(tween);
        tween.onDone?.();
      }
    }
  }

  finishAll(): void {
    while (this.list.length > 0) {
      const pending = [...this.list].sort((a, b) => a.delay + a.duration - (b.delay + b.duration));
      this.list = [];
      for (const tween of pending) {
        if (!tween.started) {
          tween.started = true;
          tween.onStart?.();
        }
        if (!tween.target.destroyed) {
          for (const prop of Object.keys(tween.to) as Prop[]) write(tween.target, prop, tween.to[prop]!);
        }
        tween.onDone?.();
      }
    }
  }

  private start(tween: Tween): void {
    tween.started = true;
    // A newly started tween takes over the target: drop older running ones.
    this.list = this.list.filter((t) => t === tween || t.target !== tween.target || !t.started);
    for (const prop of Object.keys(tween.to) as Prop[]) tween.from[prop] = read(tween.target, prop);
    tween.onStart?.();
  }

  private remove(tween: Tween): void {
    const i = this.list.indexOf(tween);
    if (i >= 0) this.list.splice(i, 1);
  }
}
