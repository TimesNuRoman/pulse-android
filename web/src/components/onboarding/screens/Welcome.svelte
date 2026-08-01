<script lang="ts">
  interface Props {
    onContinue: () => void;
  }

  let { onContinue }: Props = $props();
</script>

<section
  class="welcome"
  data-testid="screen-welcome"
  data-screen="welcome"
  aria-labelledby="welcome-title"
>
  <div class="welcome__icon" data-testid="welcome-icon" aria-hidden="true">
    <svg
      width="96"
      height="96"
      viewBox="0 0 96 96"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Pulse Notes app icon"
    >
      <defs>
        <linearGradient id="welcome-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#7aa2f7" />
          <stop offset="1" stop-color="#bb9af7" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="96" height="96" rx="22" fill="url(#welcome-bg)" />
      <!-- Stylized P -->
      <path
        d="M34 26h16c8.8 0 16 7.2 16 16s-7.2 16-16 16h-8v12h-8V26zm8 8v16h8c4.4 0 8-3.6 8-8s-3.6-8-8-8h-8z"
        fill="#1a1b26"
      />
      <!-- Spark: 3 small dots arranged like a spark (no emoji glyph) -->
      <circle cx="78" cy="20" r="3" fill="#1a1b26" />
      <circle cx="84" cy="14" r="2" fill="#1a1b26" />
      <circle cx="72" cy="14" r="2" fill="#1a1b26" />
    </svg>
  </div>

  <h1 id="welcome-title" class="welcome__title" data-testid="welcome-title">Welcome to Pulse Notes</h1>

  <p class="welcome__subtitle" data-testid="welcome-subtitle">
    A markdown editor, built for Android, from scratch.
  </p>

  <p class="welcome__meta" data-testid="welcome-meta">v0.6.2 &middot; 4.36 MB &middot; Apache 2.0</p>

  <button
    type="button"
    class="welcome__cta"
    data-testid="welcome-cta"
    onclick={onContinue}
  >
    Get started
  </button>
</section>

<style>
  .welcome {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--tn-sp-6) var(--tn-sp-5);
    min-height: 100%;
    text-align: center;
    gap: var(--tn-sp-4);
  }

  .welcome__icon {
    margin-bottom: var(--tn-sp-3);
  }

  .welcome__title {
    font-size: 28px;
    line-height: 1.2;
    margin: 0;
    color: var(--tn-fg);
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .welcome__subtitle {
    font-size: 17px;
    line-height: 1.5;
    color: var(--tn-fg-dim);
    margin: 0;
    max-width: 320px;
  }

  .welcome__meta {
    font-size: 13px;
    line-height: 1.4;
    color: var(--tn-fg-muted);
    margin: var(--tn-sp-1) 0 0 0;
    font-family: var(--tn-font-mono);
  }

  .welcome__cta {
    margin-top: var(--tn-sp-6);
    width: 100%;
    max-width: 320px;
    min-height: var(--tn-touch-pref); /* 48dp M3 expressive */
    padding: 0 var(--tn-sp-5);
    background: var(--tn-accent-blue);
    color: var(--tn-bg);
    border: 0;
    border-radius: var(--tn-radius-md);
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 150ms ease, transform 100ms ease;
  }

  .welcome__cta:hover {
    opacity: 0.92;
  }

  .welcome__cta:active {
    transform: scale(0.98);
  }

  .welcome__cta:focus-visible {
    outline: 2px solid var(--tn-fg);
    outline-offset: 2px;
  }
</style>
