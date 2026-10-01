<script lang="ts">
  import { onMount } from 'svelte';
  import { gameConfig } from '@maw/content';
  import { track } from '$lib/analytics';
  import { GameController } from '$lib/game/controller';
  import { provideGame } from '$lib/game/context';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/components/TopBar.svelte';
  import Orders from '$lib/components/Orders.svelte';
  import BoardCanvas from '$lib/components/BoardCanvas.svelte';
  import SelectionPanel from '$lib/components/SelectionPanel.svelte';
  import CityPanel from '$lib/components/CityPanel.svelte';
  import SettingsPanel from '$lib/components/SettingsPanel.svelte';
  import Toasts from '$lib/components/Toasts.svelte';

  const controller = GameController.load(gameConfig);
  const game = controller.game;
  provideGame(controller);

  let panel = $state<'city' | 'settings' | null>(null);
  let celebrated = $state(controller.state.chapterCompleted);
  let showCelebration = $state(false);

  $effect(() => {
    if ($game.chapterCompleted && !celebrated) {
      celebrated = true;
      panel = null;
      showCelebration = true;
    }
  });

  onMount(() => {
    const started = Date.now();
    const end = () => track('session_end', { durationMs: Date.now() - started });
    window.addEventListener('pagehide', end);
    return () => {
      window.removeEventListener('pagehide', end);
      end();
    };
  });
</script>

<svelte:head>
  <title>{$t('app.title')}</title>
</svelte:head>

<div class="game">
  <TopBar onCity={() => (panel = 'city')} onSettings={() => (panel = 'settings')} />
  <Orders />
  <BoardCanvas />
  <SelectionPanel />
  <Toasts />

  {#if panel === 'city'}
    <CityPanel onClose={() => (panel = null)} />
  {:else if panel === 'settings'}
    <SettingsPanel onClose={() => (panel = null)} />
  {/if}

  {#if showCelebration}
    <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="celebration-title">
      <div class="celebration">
        <div class="emoji big" aria-hidden="true">🎉🗼🎉</div>
        <h2 id="celebration-title">{$t('city.completed_title')}</h2>
        <p>{$t('city.completed_body')}</p>
        <button class="btn" onclick={() => (showCelebration = false)}>{$t('city.close')}</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .game {
    height: 100dvh;
    display: flex;
    flex-direction: column;
    max-width: 720px;
    margin: 0 auto;
    padding: env(safe-area-inset-top) 8px env(safe-area-inset-bottom);
    gap: 6px;
    user-select: none;
    -webkit-user-select: none;
  }
  .overlay {
    position: fixed;
    inset: 0;
    background: rgb(20 20 40 / 0.55);
    display: grid;
    place-items: center;
    z-index: 50;
    padding: 16px;
  }
  .celebration {
    background: var(--panel);
    border-radius: 20px;
    padding: 24px;
    text-align: center;
    max-width: 380px;
    box-shadow: var(--shadow);
  }
  .big {
    font-size: 48px;
  }
</style>
