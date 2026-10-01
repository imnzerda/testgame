import { generatorSpec, type GameConfig } from './config';
import type { GameState, Item } from './types';

export function createItem(state: GameState, config: GameConfig, chain: string, level: number): Item {
  const item: Item = { id: state.nextId++, chain, level };
  const spec = generatorSpec(config, chain, level);
  if (spec && spec.maxCharges !== null) {
    item.gen = { charges: spec.maxCharges, rechargeAt: null };
  }
  return item;
}

/** Refills a generator whose cooldown is over. */
export function refreshCharges(item: Item, config: GameConfig, now: number): void {
  const spec = generatorSpec(config, item.chain, item.level);
  if (!spec || spec.maxCharges === null || !item.gen) return;
  if (item.gen.rechargeAt !== null && item.gen.rechargeAt <= now) {
    item.gen.charges = spec.maxCharges;
    item.gen.rechargeAt = null;
  }
}
