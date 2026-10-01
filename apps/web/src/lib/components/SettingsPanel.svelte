<script lang="ts">
  import { useGame } from '$lib/game/context';
  import { prefs } from '$lib/game/prefs';
  import { LOCALES, locale, t, type Locale } from '$lib/i18n';
  import Modal from './Modal.svelte';

  let { onClose }: { onClose: () => void } = $props();
  const controller = useGame();
  const game = controller.game;

  function reset() {
    if (confirm($t('settings.reset_confirm'))) {
      controller.reset();
      onClose();
    }
  }
</script>

<Modal title={$t('settings.title')} {onClose}>
  <div class="rows">
    <label class="row">
      <span>🌐 {$t('settings.language')}</span>
      <select value={$locale} onchange={(e) => locale.set(e.currentTarget.value as Locale)}>
        {#each LOCALES as l}
          <option value={l.id}>{l.label}</option>
        {/each}
      </select>
    </label>

    <label class="row">
      <span>🛡️ {$t('settings.protect')}</span>
      <input
        type="checkbox"
        checked={$game.settings.protectOrderItems}
        onchange={(e) => controller.setProtectOrderItems(e.currentTarget.checked)}
      />
    </label>

    <label class="row">
      <span>🐢 {$t('settings.reduced_motion')}</span>
      <input
        type="checkbox"
        checked={$prefs.reducedMotion}
        onchange={(e) => prefs.update((p) => ({ ...p, reducedMotion: e.currentTarget.checked }))}
      />
    </label>

    <button class="btn secondary danger" onclick={reset}>↺ {$t('settings.reset')}</button>
  </div>
</Modal>

<style>
  .rows {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 44px;
  }
  select {
    font: inherit;
    padding: 6px 10px;
    border-radius: 10px;
    border: 2px solid var(--panel-border);
    background: #fff;
  }
  input[type='checkbox'] {
    width: 26px;
    height: 26px;
    accent-color: var(--accent);
  }
  .danger {
    color: var(--warn);
    margin-top: 8px;
  }
</style>
