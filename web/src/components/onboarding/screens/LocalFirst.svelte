<script lang="ts">
  interface Props {
    onContinue: () => void;
  }

  let { onContinue }: Props = $props();
</script>

<section
  class="lf"
  data-testid="screen-local-first"
  data-screen="local-first"
  aria-labelledby="lf-title"
>
  <div class="lf__icon" data-testid="lf-icon" aria-hidden="true">
    <svg
      width="72"
      height="72"
      viewBox="0 0 72 72"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Lock icon"
    >
      <!-- Lock body -->
      <rect x="18" y="32" width="36" height="28" rx="4" fill="#7aa2f7" />
      <!-- Lock shackle -->
      <path
        d="M26 32v-6a10 10 0 0 1 20 0v6"
        fill="none"
        stroke="#7aa2f7"
        stroke-width="4"
        stroke-linecap="round"
      />
      <!-- Lock keyhole (no emoji — geometric path only) -->
      <circle cx="36" cy="44" r="3" fill="#1a1b26" />
      <rect x="34.5" y="44" width="3" height="8" rx="1.5" fill="#1a1b26" />
    </svg>
  </div>

  <h1 id="lf-title" class="lf__title" data-testid="lf-title">Local-first, forever</h1>

  <p class="lf__desc" data-testid="lf-desc">
    Notes stay on your phone. Sync is opt-in and end-to-end encrypted. No telemetry, no ads.
  </p>

  <ul class="lf__list" data-testid="lf-list" aria-label="Local-first promises">
    <li class="lf__item" data-testid="lf-item-storage">
      <span class="lf__bullet" aria-hidden="true"></span>
      <span class="lf__text">All notes on-device by default</span>
    </li>
    <li class="lf__item" data-testid="lf-item-sync">
      <span class="lf__bullet" aria-hidden="true"></span>
      <span class="lf__text">Opt-in E2E encrypted sync, never required</span>
    </li>
    <li class="lf__item" data-testid="lf-item-privacy">
      <span class="lf__bullet" aria-hidden="true"></span>
      <span class="lf__text">Zero telemetry, zero ad networks, zero tracking</span>
    </li>
  </ul>

  <button
    type="button"
    class="lf__cta"
    data-testid="lf-cta"
    onclick={onContinue}
  >
    Start writing
  </button>

  <p class="lf__footer" data-testid="lf-footer">
    By continuing you accept the Apache 2.0 license.
  </p>
</section>

<style>
  .lf {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--tn-sp-6) var(--tn-sp-5);
    min-height: 100%;
    text-align: center;
    gap: var(--tn-sp-4);
  }

  .lf__icon {
    margin-bottom: var(--tn-sp-2);
  }

  .lf__title {
    font-size: 26px;
    line-height: 1.25;
    margin: 0;
    color: var(--tn-fg);
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .lf__desc {
    font-size: 16px;
    line-height: 1.5;
    color: var(--tn-fg-dim);
    margin: 0;
    max-width: 340px;
  }

  .lf__list {
    list-style: none;
    margin: var(--tn-sp-3) 0 0 0;
    padding: 0;
    width: 100%;
    max-width: 320px;
    display: flex;
    flex-direction: column;
    gap: var(--tn-sp-2);
    text-align: left;
  }

  .lf__item {
    display: flex;
    align-items: flex-start;
    gap: var(--tn-sp-3);
    background: var(--tn-bg-elevated);
    border: 1px solid var(--tn-border);
    border-radius: var(--tn-radius-md);
    padding: var(--tn-sp-3);
  }

  .lf__bullet {
    flex: 0 0 auto;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--tn-accent-green);
    margin-top: 8px;
  }

  .lf__text {
    font-size: 14px;
    line-height: 1.45;
    color: var(--tn-fg);
  }

  .lf__cta {
    margin-top: var(--tn-sp-5);
    width: 100%;
    max-width: 320px;
    min-height: var(--tn-touch-pref);
    padding: 0 var(--tn-sp-5);
    background: var(--tn-accent-purple);
    color: var(--tn-bg);
    border: 0;
    border-radius: var(--tn-radius-md);
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 150ms ease, transform 100ms ease;
  }

  .lf__cta:hover {
    opacity: 0.92;
  }

  .lf__cta:active {
    transform: scale(0.98);
  }

  .lf__cta:focus-visible {
    outline: 2px solid var(--tn-fg);
    outline-offset: 2px;
  }

  .lf__footer {
    font-size: 12px;
    line-height: 1.4;
    color: var(--tn-fg-muted);
    margin: var(--tn-sp-1) 0 0 0;
  }
</style>
