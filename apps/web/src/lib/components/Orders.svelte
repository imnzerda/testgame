<script lang="ts">
  import { matchOrder } from '@maw/engine';
  import { useGame } from '$lib/game/context';
  import { itemEmoji, itemKey } from '$lib/game/display';
  import { t } from '$lib/i18n';

  const controller = useGame();
  const game = controller.game;
  const config = controller.config;

  const orders = $derived(
    $game.orders.map((order, slot) => {
      if (!order) return null;
      const matches = matchOrder($game.board, order.requirements);
      return { order, slot, matches, ready: matches.every((m) => m !== null) };
    })
  );
</script>

<section class="orders" aria-label={$t('orders.title')}>
  {#each orders as entry, i (entry?.order.id ?? `empty-${i}`)}
    {#if entry}
      <article class="order" class:ready={entry.ready}>
        <ul class="reqs">
          {#each entry.order.requirements as req, j}
            <li class:have={entry.matches[j] !== null}
              title={$t(`item.${itemKey(config, req.chain, req.level)}`)}>
              <span class="emoji">{itemEmoji(config, req.chain, req.level)}</span>
              <span class="lv">{req.level}</span>
              {#if entry.matches[j] !== null}<span class="check" aria-hidden="true">✓</span>{/if}
              <span class="sr-only">{$t(`item.${itemKey(config, req.chain, req.level)}`)}</span>
            </li>
          {/each}
        </ul>
        <div class="reward">
          <span>🪙 {entry.order.reward.coins}</span>
          <span>⭐ {entry.order.reward.xp}</span>
          {#if entry.order.reward.energy}<span>⚡ {entry.order.reward.energy}</span>{/if}
          {#if entry.order.reward.gems}<span>💎 {entry.order.reward.gems}</span>{/if}
        </div>
        <button class="btn deliver" disabled={!entry.ready} onclick={() => controller.deliver(entry.slot)}>
          {$t('orders.deliver')}
        </button>
      </article>
    {/if}
  {/each}
</section>

<style>
  .orders {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
    flex: 0 0 auto;
  }
  .order {
    background: var(--panel);
    border: 2px solid var(--panel-border);
    border-radius: var(--radius);
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: center;
    box-shadow: var(--shadow);
    min-width: 0;
  }
  .order.ready {
    border-color: var(--good);
    background: #f0fbf2;
  }
  .reqs {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    gap: 3px;
    flex-wrap: nowrap;
    justify-content: center;
  }
  .reqs li {
    position: relative;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: #f1e6cc;
    display: grid;
    place-items: center;
    font-size: 21px;
  }
  .reqs li.have {
    background: #d8f3dc;
  }
  .lv {
    position: absolute;
    right: -3px;
    bottom: -3px;
    background: var(--accent);
    color: #fff;
    font-size: 11px;
    font-weight: 800;
    border-radius: 999px;
    min-width: 17px;
    height: 17px;
    display: grid;
    place-items: center;
    border: 2px solid #fff;
  }
  .check {
    position: absolute;
    left: -3px;
    top: -3px;
    background: var(--good);
    color: #fff;
    font-size: 11px;
    font-weight: 900;
    border-radius: 999px;
    width: 17px;
    height: 17px;
    display: grid;
    place-items: center;
  }
  .reward {
    display: flex;
    gap: 6px;
    font-size: 13px;
    font-weight: 700;
    flex-wrap: nowrap;
    justify-content: center;
    white-space: nowrap;
  }
  .deliver {
    width: 100%;
    min-height: 36px;
    padding: 4px 8px;
    font-size: 15px;
    background: var(--good);
  }
</style>
