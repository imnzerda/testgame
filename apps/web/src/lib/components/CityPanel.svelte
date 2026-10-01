<script lang="ts">
  import { currentChapter } from '@maw/engine';
  import { visuals } from '@maw/content';
  import { useGame } from '$lib/game/context';
  import { t } from '$lib/i18n';
  import Modal from './Modal.svelte';

  let { onClose }: { onClose: () => void } = $props();
  const controller = useGame();
  const game = controller.game;

  const chapter = $derived(currentChapter($game, controller.config));
  const done = $derived(chapter.tasks.filter((task) => $game.tasksDone.includes(task.id)).length);
  const pct = $derived(Math.round((done / chapter.tasks.length) * 100));
</script>

<Modal title={$t('city.title')} {onClose}>
  <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct}>
    <span class="emoji city">{visuals.cities[chapter.city] ?? '🏙️'}</span>
    <div class="track"><div class="fill" style:width="{pct}%"></div></div>
    <strong>{done}/{chapter.tasks.length}</strong>
  </div>

  <ul class="tasks">
    {#each chapter.tasks as task (task.id)}
      {@const isDone = $game.tasksDone.includes(task.id)}
      {@const unlocked = task.requires.every((r) => $game.tasksDone.includes(r))}
      <li class:done={isDone} class:locked={!unlocked && !isDone}>
        <span class="emoji icon">{visuals.tasks[task.id] ?? '🔨'}</span>
        <span class="name">{$t(`task.${task.id}`)}</span>
        {#if isDone}
          <span class="badge">✓ {$t('city.done')}</span>
        {:else if !unlocked}
          <span class="badge" aria-label={$t('error.task_locked')}>🔒</span>
        {:else}
          <button
            class="btn"
            disabled={$game.coins < task.cost}
            onclick={() => controller.renovate(task.id)}
          >
            🪙 {task.cost}
          </button>
        {/if}
      </li>
    {/each}
  </ul>
</Modal>

<style>
  .progress {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }
  .city {
    font-size: 36px;
  }
  .track {
    flex: 1;
    height: 14px;
    background: #e8dcc2;
    border-radius: 999px;
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: linear-gradient(90deg, #7fc8a9, var(--good));
    transition: width 0.4s;
  }
  .tasks {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 12px;
    background: #fff;
    border: 2px solid var(--panel-border);
  }
  li.done {
    background: #eef9f0;
    border-color: #b5e0bf;
  }
  li.locked {
    opacity: 0.6;
  }
  .icon {
    font-size: 26px;
  }
  .name {
    flex: 1;
  }
  .badge {
    font-weight: 700;
    color: var(--good);
  }
</style>
