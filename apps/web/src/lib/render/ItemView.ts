import { Container, Graphics, Text } from 'pixi.js';
import { itemDef, maxLevel, type BlockerKind, type GameConfig, type Item } from '@maw/engine';
import type { ChainShape, Visuals } from '@maw/content';

export const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';

export interface ViewContext {
  config: GameConfig;
  visuals: Visuals;
}

function shapePath(g: Graphics, shape: ChainShape, size: number): Graphics {
  const h = size / 2;
  switch (shape) {
    case 'circle':
      return g.circle(0, 0, h);
    case 'diamond':
      return g.roundShape(
        [
          { x: 0, y: -h * 1.08 },
          { x: h * 1.08, y: 0 },
          { x: 0, y: h * 1.08 },
          { x: -h * 1.08, y: 0 }
        ],
        size * 0.14
      );
    case 'hexagon': {
      const points = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i;
        return { x: Math.cos(a) * h, y: Math.sin(a) * h };
      });
      return g.roundShape(points, size * 0.08);
    }
    case 'square':
    default:
      return g.roundRect(-h, -h, size, size, size * 0.22);
  }
}

/**
 * One board item. Each chain has its own colour AND silhouette (colour-blind friendly),
 * plus a level badge so items are readable without text.
 */
export class ItemView extends Container {
  cell: number;
  readonly itemId: number;
  private signature = '';

  constructor(item: Item, blocker: BlockerKind | null, cell: number, cs: number, ctx: ViewContext) {
    super();
    this.itemId = item.id;
    this.cell = cell;
    this.update(item, blocker, cs, ctx, Date.now());
  }

  update(item: Item, blocker: BlockerKind | null, cs: number, ctx: ViewContext, now: number): void {
    const cooling = !!item.gen && item.gen.charges <= 0 && (item.gen.rechargeAt ?? 0) > now;
    const sig = `${item.chain}|${item.level}|${blocker}|${!!item.pinned}|${cs}|${cooling}`;
    if (sig === this.signature) return;
    this.signature = sig;
    for (const child of this.removeChildren()) child.destroy({ children: true });

    const { config, visuals } = ctx;
    const def = itemDef(config, item.chain, item.level);
    const style = visuals.chains[item.chain] ?? { color: '#dddddd', outline: '#666666', shape: 'square' as const };
    const isGen = !!def.generator;
    const isMax = item.level >= maxLevel(config, item.chain);
    const size = cs * 0.8;

    if (blocker === 'box') {
      const box = new Graphics()
        .roundRect(-cs * 0.44, -cs * 0.44, cs * 0.88, cs * 0.88, cs * 0.12)
        .fill({ color: 0xc89a63 })
        .stroke({ width: Math.max(2, cs * 0.04), color: 0x8a5a2b });
      box.rect(-cs * 0.07, -cs * 0.44, cs * 0.14, cs * 0.88).fill({ color: 0xe8c99b });
      const mark = new Text({ text: '?', style: { fontSize: cs * 0.34, fontWeight: '800', fill: 0x6b4220 } });
      mark.anchor.set(0.5);
      this.addChild(box, mark);
      return;
    }

    const body = new Container();
    const bg = shapePath(new Graphics(), style.shape, size)
      .fill({ color: style.color })
      .stroke({ width: Math.max(2, cs * 0.045), color: isGen ? 0xd4a017 : style.outline });
    if (isGen) {
      shapePath(bg, style.shape, size * 0.86).stroke({ width: Math.max(1, cs * 0.02), color: 0xffffff, alpha: 0.8 });
    }
    const icon = new Text({
      text: visuals.items[def.key] ?? '❔',
      style: { fontSize: cs * 0.46, fontFamily: EMOJI_FONT }
    });
    icon.anchor.set(0.5);
    body.addChild(bg, icon);

    // Level badge (bottom-right); max level gets a star.
    const badge = new Container();
    const r = cs * 0.15;
    badge.addChild(
      new Graphics()
        .circle(0, 0, r)
        .fill({ color: isMax ? 0xf2b705 : 0x2b4c7e })
        .stroke({ width: Math.max(1.5, cs * 0.025), color: 0xffffff })
    );
    const label = new Text({
      text: isMax ? '★' : String(item.level),
      style: { fontSize: r * 1.25, fontWeight: '800', fill: 0xffffff }
    });
    label.anchor.set(0.5);
    badge.addChild(label);
    badge.position.set(cs * 0.31, cs * 0.31);
    body.addChild(badge);

    if (isGen) {
      const bolt = new Text({ text: '⚡', style: { fontSize: cs * 0.2, fontFamily: EMOJI_FONT } });
      bolt.anchor.set(0.5);
      bolt.position.set(-cs * 0.3, -cs * 0.3);
      body.addChild(bolt);
    }
    if (cooling) {
      body.alpha = 0.6;
      const clock = new Text({ text: '⏳', style: { fontSize: cs * 0.24, fontFamily: EMOJI_FONT } });
      clock.anchor.set(0.5);
      clock.position.set(cs * 0.3, -cs * 0.3);
      body.addChild(clock);
    }
    if (item.pinned) {
      const lock = new Text({ text: '🔒', style: { fontSize: cs * 0.22, fontFamily: EMOJI_FONT } });
      lock.anchor.set(0.5);
      lock.position.set(-cs * 0.3, -cs * 0.3);
      body.addChild(lock);
    }
    this.addChild(body);

    if (blocker === 'web') {
      body.alpha = 0.55;
      this.addChild(webOverlay(cs));
    }
  }
}

function webOverlay(cs: number): Graphics {
  const g = new Graphics();
  const R = cs * 0.46;
  const stroke = { width: Math.max(1, cs * 0.02), color: 0xffffff, alpha: 0.9 };
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i;
    g.moveTo(0, 0).lineTo(Math.cos(a) * R, Math.sin(a) * R);
  }
  for (const k of [0.35, 0.65, 0.95]) {
    const pts = Array.from({ length: 8 }, (_, i) => {
      const a = (Math.PI / 4) * i;
      return [Math.cos(a) * R * k, Math.sin(a) * R * k] as const;
    });
    g.moveTo(pts[0]![0], pts[0]![1]);
    for (const [x, y] of [...pts.slice(1), pts[0]!]) g.lineTo(x, y);
  }
  g.stroke(stroke);
  g.roundRect(-cs * 0.44, -cs * 0.44, cs * 0.88, cs * 0.88, cs * 0.12).fill({ color: 0xffffff, alpha: 0.18 });
  return g;
}
