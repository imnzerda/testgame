import { getContext, setContext } from 'svelte';
import type { GameController } from './controller';

const KEY = Symbol('game');

export function provideGame(controller: GameController): void {
  setContext(KEY, controller);
}

export function useGame(): GameController {
  const controller = getContext<GameController | undefined>(KEY);
  if (!controller) throw new Error('useGame() called outside of the game page');
  return controller;
}
