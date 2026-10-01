<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { visuals } from '@maw/content';
  import { useGame } from '$lib/game/context';
  import { prefs } from '$lib/game/prefs';
  import { t } from '$lib/i18n';
  import { BoardRenderer } from '$lib/render/BoardRenderer';

  const controller = useGame();
  let host: HTMLDivElement;

  onMount(() => {
    const renderer = new BoardRenderer({
      config: controller.config,
      visuals,
      input: controller,
      onBusy: (busy) => controller.busy.set(busy),
      reducedMotion: () => get(prefs).reducedMotion
    });
    renderer.init(host).then(() => controller.attachView(renderer));
    return () => {
      controller.detachView();
      renderer.destroy();
    };
  });
</script>

<div class="board" bind:this={host} aria-label={$t('board.label')}></div>

<style>
  .board {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
  }
</style>
