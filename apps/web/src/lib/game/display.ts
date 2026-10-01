import { itemDef, type GameConfig } from '@maw/engine';
import { visuals } from '@maw/content';

export function itemKey(config: GameConfig, chain: string, level: number): string {
  return itemDef(config, chain, level).key;
}

export function itemEmoji(config: GameConfig, chain: string, level: number): string {
  return visuals.items[itemKey(config, chain, level)] ?? '❔';
}

export function formatDuration(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatNumber(n: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(n);
}
