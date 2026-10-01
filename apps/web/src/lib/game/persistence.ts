import type { GameConfig, GameState } from '@maw/engine';

/**
 * Phase 1 keeps the save in localStorage. From phase 2 the server is the source of truth
 * and this becomes a cache used only for an instant start.
 */
const SAVE_KEY = 'maw:save:v1';

export function loadState(config: GameConfig): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as GameState;
    const chapter = config.chapters[state.chapterId];
    if (state.version !== 1 || !chapter) return null;
    if (state.board.cells.length !== chapter.board.width * chapter.board.height) return null;
    return state;
  } catch {
    return null;
  }
}

export function saveState(state: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    /* storage full or unavailable: the game keeps running in memory */
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
