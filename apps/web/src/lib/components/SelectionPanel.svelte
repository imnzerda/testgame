<script lang="ts">
  import { onMount } from 'svelte';
  import { autoMergeStatus, cellAt, generatorSpec, maxLevel, sellValue } from '@maw/engine';
  import { useGame } from '$lib/game/context';
  import { itemEmoji, itemKey } from '$lib/game/display';
  import { t } from '$lib/i18n';

  const controller = useGame();
  const game = controller.game;
  const selected = controller.selected;
  const busy = controller.busy;
  const config = controller.config;

  let now = $state(Date.now());
  onMount(() => {
    const id = setInterval(() => (now = Date.now()), 5000);
    return () => clearInterval(id);
  });

  const info = $derived.by(() => {
    if ($selected === null) return null;
    const cell = cellAt($game.board, $selected);
    const item = cell.item;
    if (!item || cell.blocker === 'box') return null;
    const max = maxLevel(config, item.chain);
    const spec = generatorSpec(config, item.chain, item.level);
    const total = spec?.produces.reduce((s, p) => s + p.weight, 0) ?? 0;
    return {
      item,
      blocked: cell.blocker !== null,
      name: $t(`item.${itemKey(config, item.chain, item.level)}`),
      emoji: itemEmoji(config, item.chain, item.level),
      max,
      next: item.level < max ? itemEmoji(config, item.chain, item.level + 1) : null,
      sell: sellValue(config, item),
      odds: spec
        ? spec.produces.map((p) => ({
            emoji: itemEmoji(config, p.chain, p.level),
            level: p.level,
            pct: Math.round((p.weight / total) * 1000) / 10
          }))
        : null
    };
  });

  const auto = $derived(autoMergeStatus($game, config, now, controller.entitlements));
</script>

<section class="panel">
  <div class="info" aria-live="polite">
    {#if info}
      <div class="head">
        <span class="emoji big">{info.emoji}</span>
        <div class="text">
          <strong>{info.name}</strong>
          <span class="muted">{$t('sel.level', { level: info.item.level, max: info.max })}
            {#if info.next}· {$t('sel.next')} <span class="emoji">{info.next}</span>{/if}</span>
          {#if info.blocked}<span class="muted">🕸️ {$t('sel.locked')}</span>{/if}
          {#if info.item.pinned}<span class="muted">🔒 {$t('sel.pinned')}</span>{/if}
        </div>
      </div>
      {#if info.odds}
        <div class="odds" aria-label={$t('sel.odds')}>
          {#each info.odds as o}
            <span class="odd"><span class="emoji">{o.emoji}</span><small>{o.level}</small> {o.pct}%</span>
          {/each}
        </div>
      {/if}
    {:else}
      <span class="muted hint">👆 {$t('sel.empty')}</span>
    {/if}
  </div>

  <div class="buttons">
    {#if info?.odds && !info.blocked}
      <button class="btn produce" onclick={() => controller.produceSelected()} disabled={$busy}
        aria-label={$t('sel.produce')} title={$t('sel.produce')}>
        ▶ <span class="emoji">⚡</span>{config.balance.energy.costPerGenerate}
      </button>
    {:else if info && info.sell !== null && !info.blocked}
      <button class="btn secondary" onclick={() => controller.tapRecycle()} disabled={$busy}
        aria-label={$t('sel.sell')} title={$t('sel.sell')}>
        <span class="emoji">♻️</span> +{info.sell} 🪙
      </button>
    {/if}
    <button
      class="btn auto"
      onclick={() => controller.autoMerge()}
      disabled={$busy || !auto.unlocked || auto.remaining === 0}
      title={auto.unlocked ? $t('auto.label') : $t('error.auto_merge_locked')}
    >
      <span class="emoji">🧲</span>
      {#if !auto.unlocked}
        🔒{auto.unlockLevel}
      {:else if auto.remaining === null}
        ∞
      {:else}
        {auto.remaining}
      {/if}
      <span class="sr-only">{$t('auto.label')}</span>
    </button>
  </div>
</section>

<style>
  .panel {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--panel);
    border-radius: var(--radius);
    padding: 8px 10px;
    box-shadow: var(--shadow);
    /* Fixed height: selecting an item must never resize the board. */
    height: 84px;
    flex: 0 0 auto;
    overflow: hidden;
    margin-bottom: 6px;
  }
  .info {
    flex: 1;
    min-width: 0;
    max-height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .head {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .big {
    font-size: 30px;
  }
  .text strong {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .muted {
    color: var(--ink-soft);
    font-size: 14px;
  }
  .hint {
    font-size: 16px;
  }
  .odds {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 8px;
    font-size: 13px;
    font-weight: 600;
  }
  .odd small {
    font-size: 11px;
    vertical-align: sub;
    color: var(--ink-soft);
  }
  .buttons {
    flex: 0 0 auto;
    display: flex;
    gap: 6px;
    flex-wrap: nowrap;
    justify-content: flex-end;
  }
  .buttons .btn {
    padding: 8px 12px;
  }
  .produce {
    background: var(--gold);
    color: #2a2118;
  }
  .auto {
    background: #6b4fa0;
  }
</style>
