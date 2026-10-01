<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '$lib/i18n';

  let { title, onClose, children }: { title: string; onClose: () => void; children: Snippet } = $props();

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && onClose()}>
  <div class="modal" role="dialog" aria-modal="true" aria-label={title}>
    <header>
      <h2>{title}</h2>
      <button class="close" onclick={onClose} aria-label={$t('city.close')}>✕</button>
    </header>
    <div class="body">
      {@render children()}
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgb(20 20 40 / 0.5);
    display: grid;
    place-items: center;
    z-index: 40;
    padding: 12px;
  }
  .modal {
    background: var(--panel);
    border-radius: 20px;
    width: min(480px, 100%);
    max-height: 90dvh;
    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 12px 4px 20px;
  }
  h2 {
    margin: 0;
    font-size: 20px;
  }
  .close {
    font-size: 20px;
    border-radius: 50%;
  }
  .body {
    overflow: auto;
    padding: 8px 20px 20px;
  }
</style>
