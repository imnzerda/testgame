<script lang="ts">
  import { onMount } from 'svelte';
  import type { Toast } from '$lib/game/controller';
  import { useGame } from '$lib/game/context';
  import { t } from '$lib/i18n';

  const controller = useGame();
  let items = $state<Toast[]>([]);

  onMount(() =>
    controller.toast.subscribe((toast) => {
      if (!toast) return;
      items = [...items.slice(-2), toast];
      setTimeout(() => (items = items.filter((i) => i.id !== toast.id)), 2200);
    })
  );
</script>

<div class="toasts" aria-live="assertive">
  {#each items as toast (toast.id)}
    <div class="toast {toast.kind}">{$t(toast.key, toast.params)}</div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    left: 50%;
    top: 30%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;
    pointer-events: none;
    z-index: 30;
  }
  .toast {
    padding: 10px 18px;
    border-radius: 999px;
    font-weight: 700;
    color: #fff;
    background: rgb(40 40 60 / 0.9);
    box-shadow: var(--shadow);
    animation: pop 0.2s ease-out;
  }
  .toast.error {
    background: rgb(192 57 43 / 0.95);
  }
  .toast.success {
    background: rgb(47 143 78 / 0.95);
  }
  @keyframes pop {
    from {
      transform: scale(0.8);
      opacity: 0;
    }
  }
</style>
