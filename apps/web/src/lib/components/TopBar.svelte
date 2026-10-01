<script lang="ts">
  import { onMount } from 'svelte';
  import { energyAt, xpToNext } from '@maw/engine';
  import { useGame } from '$lib/game/context';
  import { formatDuration, formatNumber } from '$lib/game/display';
  import { locale, t } from '$lib/i18n';

  let { onCity, onSettings }: { onCity: () => void; onSettings: () => void } = $props();
  const controller = useGame();

  const game = controller.game;
  const balance = controller.config.balance;
  let now = $state(Date.now());

  onMount(() => {
    const id = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(id);
  });

  const energy = $derived(energyAt($game, balance, now));
  const xpNeeded = $derived(xpToNext(balance, $game.level));
  const xpPct = $derived(Math.min(100, ($game.xp / xpNeeded) * 100));
</script>

<header class="bar">
  <div class="level" title={$t('hud.level', { level: $game.level })}>
    <span class="star" aria-hidden="true">⭐</span>
    <span class="lvl">{$game.level}</span>
    <div class="xp" role="progressbar" aria-valuemin="0" aria-valuemax={xpNeeded} aria-valuenow={$game.xp}
      aria-label={$t('hud.level', { level: $game.level })}>
      <div class="fill" style:width="{xpPct}%"></div>
    </div>
  </div>

  <div class="stat energy" aria-label={$t('hud.energy')}>
    <span class="emoji" aria-hidden="true">⚡</span>
    <span class="stack">
      <span class="value">{energy.energy}<small>/{energy.max}</small></span>
      {#if energy.nextInMs !== null}
        <span class="timer" title={$t('hud.next_energy', { time: formatDuration(energy.nextInMs) })}>
          +1 · {formatDuration(energy.nextInMs)}
        </span>
      {/if}
    </span>
  </div>

  <div class="stat" aria-label={$t('hud.coins')}>
    <span class="emoji" aria-hidden="true">🪙</span>
    <span class="value">{formatNumber($game.coins, $locale)}</span>
  </div>

  <div class="stat" aria-label={$t('hud.gems')}>
    <span class="emoji" aria-hidden="true">💎</span>
    <span class="value">{formatNumber($game.gems, $locale)}</span>
  </div>

  <div class="actions">
    <button class="icon" onclick={onCity} aria-label={$t('hud.city')} title={$t('hud.city')}>
      <span class="emoji">🏗️</span>
    </button>
    <button class="icon" onclick={onSettings} aria-label={$t('hud.settings')} title={$t('hud.settings')}>
      <span class="emoji">⚙️</span>
    </button>
  </div>
</header>

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 0 0;
    flex: 0 0 auto;
    min-width: 0;
  }
  .level {
    min-height: 40px;
    display: flex;
    align-items: center;
    gap: 4px;
    background: var(--panel);
    border-radius: 999px;
    padding: 4px 10px 4px 6px;
    box-shadow: var(--shadow);
  }
  .star {
    font-size: 20px;
  }
  .lvl {
    font-weight: 800;
    min-width: 1.2em;
  }
  .xp {
    width: 30px;
    height: 10px;
    background: #e8dcc2;
    border-radius: 999px;
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: linear-gradient(90deg, #f7c948, var(--gold));
    transition: width 0.3s;
  }
  .stat {
    display: flex;
    align-items: center;
    gap: 4px;
    background: var(--panel);
    border-radius: 999px;
    padding: 4px 8px;
    min-height: 40px;
    font-size: 15px;
    box-shadow: var(--shadow);
    font-weight: 800;
    white-space: nowrap;
  }
  .stack {
    display: flex;
    flex-direction: column;
    line-height: 1.1;
  }
  .stat small {
    font-weight: 600;
    color: var(--ink-soft);
  }
  .energy .timer {
    font-size: 11px;
    font-weight: 600;
    color: var(--ink-soft);
  }
  .actions {
    margin-left: auto;
    display: flex;
    gap: 4px;
    flex: 0 0 auto;
  }
  .icon {
    font-size: 18px;
    min-width: 38px;
    min-height: 38px;
    width: 38px;
    height: 38px;
    padding: 0;
    border-radius: 50%;
    background: var(--panel);
    box-shadow: var(--shadow);
  }
</style>
