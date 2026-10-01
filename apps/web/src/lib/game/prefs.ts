import { writable } from 'svelte/store';

/** Device-local display preferences (not part of the game state). */
export interface Prefs {
  reducedMotion: boolean;
}

const KEY = 'maw:prefs';

function load(): Prefs {
  const systemReduced =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const defaults: Prefs = { reducedMotion: !!systemReduced };
  if (typeof window === 'undefined') return defaults;
  try {
    return { ...defaults, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>) };
  } catch {
    return defaults;
  }
}

export const prefs = writable<Prefs>(load());

prefs.subscribe((p) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
});
