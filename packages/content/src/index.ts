import type { BalanceConfig, ChainDef, ChapterDef, GameConfig } from '@maw/engine';
import balance from '../data/balance.json';
import bakery from '../data/chains/bakery.json';
import flowers from '../data/chains/flowers.json';
import parisStall from '../data/chains/paris_stall.json';
import paris from '../data/chapters/paris.json';
import visualsData from '../data/visuals.json';

const chains = [bakery, flowers, parisStall] as ChainDef[];
const chapters = [paris] as ChapterDef[];

export const gameConfig: GameConfig = {
  balance: balance as BalanceConfig,
  chains: Object.fromEntries(chains.map((c) => [c.id, c])),
  chapters: Object.fromEntries(chapters.map((c) => [c.id, c])),
  firstChapter: 'paris'
};

export type ChainShape = 'circle' | 'diamond' | 'square' | 'hexagon';

export interface Visuals {
  chains: Record<string, { color: string; outline: string; shape: ChainShape }>;
  items: Record<string, string>;
  tasks: Record<string, string>;
  cities: Record<string, string>;
}

export const visuals = visualsData as Visuals;
