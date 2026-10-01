<script lang="ts">
  import { t } from '$lib/i18n';
</script>

<svelte:head>
  <title>{$t('app.title')}</title>
  <meta name="description" content={$t('app.tagline')} />
  <meta property="og:title" content={$t('app.title')} />
  <meta property="og:description" content={$t('app.tagline')} />
</svelte:head>

<main class="landing">
  <div class="hero">
    <div class="emoji logo" aria-hidden="true">🗼🥐🌷</div>
    <h1>{$t('app.title')}</h1>
    <p class="tagline">{$t('app.tagline')}</p>
    <a class="btn play" href="/play">{$t('landing.play')} ▶</a>
  </div>
  <ul class="features">
    <li><span class="emoji" aria-hidden="true">🫘 + 🫘 → ☕</span><span>{$t('landing.f1')}</span></li>
    <li><span class="emoji" aria-hidden="true">📋 → 🪙</span><span>{$t('landing.f2')}</span></li>
    <li><span class="emoji" aria-hidden="true">🗼 → 🕌 → ⛩️</span><span>{$t('landing.f3')}</span></li>
  </ul>
</main>

<style>
  .landing {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 32px;
    padding: 24px 16px;
    background: linear-gradient(180deg, #2b4c7e 0%, #5a7fb5 45%, var(--bg) 100%);
  }
  .hero {
    text-align: center;
    color: #fff;
    max-width: 560px;
  }
  .logo {
    font-size: 56px;
  }
  h1 {
    font-size: clamp(28px, 6vw, 44px);
    margin: 12px 0 8px;
  }
  .tagline {
    font-size: 18px;
    opacity: 0.95;
    margin: 0 0 24px;
  }
  .play {
    font-size: 22px;
    padding: 14px 40px;
    text-decoration: none;
    background: var(--gold);
    color: #2a2118;
  }
  .features {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 12px;
    width: min(560px, 100%);
  }
  .features li {
    display: flex;
    gap: 16px;
    align-items: center;
    background: var(--panel);
    border-radius: var(--radius);
    padding: 14px 16px;
    box-shadow: var(--shadow);
  }
  .features .emoji {
    font-size: 22px;
    flex: 0 0 auto;
  }
</style>
