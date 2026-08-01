<script lang="ts">
  interface Props {
    onContinue: () => void;
    onSkip: () => void;
  }

  let { onContinue, onSkip }: Props = $props();
</script>

<section
  class="capture"
  data-testid="screen-capture"
  data-screen="capture"
  aria-labelledby="capture-title"
>
  <button
    type="button"
    class="capture__skip"
    data-testid="capture-skip"
    onclick={onSkip}
    aria-label="Skip onboarding"
  >
    Skip
  </button>

  <h1 id="capture-title" class="capture__title" data-testid="capture-title">Capture anything</h1>

  <p class="capture__desc" data-testid="capture-desc">
    Share text, links, or images to Pulse Notes from any app. We'll keep them organized.
  </p>

  <div class="capture__mockup" data-testid="capture-mockup" aria-hidden="true">
    <svg
      width="320"
      height="200"
      viewBox="0 0 320 200"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Share sheet, then Pulse Notes entry, then saved note"
    >
      <!-- Step 1: Android share sheet -->
      <rect x="12" y="20" width="80" height="160" rx="10" fill="#24283b" stroke="#414868" stroke-width="1" />
      <rect x="20" y="32" width="64" height="6" rx="2" fill="#414868" />
      <rect x="20" y="44" width="40" height="4" rx="2" fill="#565f89" />
      <!-- share icons row -->
      <circle cx="32" cy="76" r="10" fill="#7aa2f7" />
      <circle cx="52" cy="76" r="10" fill="#bb9af7" />
      <circle cx="72" cy="76" r="10" fill="#9ece6a" />
      <rect x="22" y="100" width="60" height="6" rx="2" fill="#c0caf5" />
      <rect x="22" y="112" width="40" height="4" rx="2" fill="#9aa5ce" />
      <rect x="22" y="132" width="64" height="32" rx="6" fill="#1f2335" stroke="#7aa2f7" stroke-width="1.5" />
      <text x="54" y="152" text-anchor="middle" fill="#7aa2f7" font-size="9" font-family="-apple-system, sans-serif">Pulse Notes</text>
      <text x="54" y="166" text-anchor="middle" fill="#7aa2f7" font-size="7" font-family="-apple-system, sans-serif">Save to note</text>

      <!-- arrow -->
      <path d="M104 100 L130 100 M120 94 L130 100 L120 106" stroke="#7aa2f7" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />

      <!-- Step 2: Pulse entry card -->
      <rect x="138" y="20" width="80" height="160" rx="10" fill="#24283b" stroke="#414868" stroke-width="1" />
      <rect x="146" y="32" width="64" height="6" rx="2" fill="#414868" />
      <rect x="146" y="44" width="50" height="4" rx="2" fill="#565f89" />
      <rect x="146" y="60" width="64" height="40" rx="6" fill="#1a1b26" />
      <rect x="152" y="68" width="52" height="4" rx="2" fill="#7aa2f7" />
      <rect x="152" y="78" width="40" height="3" rx="1.5" fill="#9aa5ce" />
      <rect x="152" y="86" width="48" height="3" rx="1.5" fill="#9aa5ce" />
      <rect x="146" y="110" width="64" height="32" rx="6" fill="#1f2335" stroke="#bb9af7" stroke-width="1" />
      <circle cx="158" cy="126" r="6" fill="#bb9af7" />
      <rect x="170" y="122" width="32" height="3" rx="1.5" fill="#c0caf5" />
      <rect x="170" y="130" width="24" height="3" rx="1.5" fill="#9aa5ce" />
      <rect x="146" y="150" width="64" height="22" rx="6" fill="#1f2335" stroke="#7dcfff" stroke-width="1" />
      <rect x="152" y="158" width="52" height="3" rx="1.5" fill="#7dcfff" />
      <rect x="152" y="166" width="36" height="3" rx="1.5" fill="#9aa5ce" />

      <!-- arrow -->
      <path d="M230 100 L256 100 M246 94 L256 100 L246 106" stroke="#7aa2f7" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />

      <!-- Step 3: Saved note -->
      <rect x="264" y="20" width="44" height="160" rx="10" fill="#24283b" stroke="#9ece6a" stroke-width="1.5" />
      <rect x="270" y="32" width="32" height="4" rx="2" fill="#9ece6a" />
      <rect x="270" y="44" width="32" height="50" rx="4" fill="#1a1b26" />
      <rect x="274" y="50" width="24" height="3" rx="1.5" fill="#c0caf5" />
      <rect x="274" y="58" width="20" height="3" rx="1.5" fill="#9aa5ce" />
      <rect x="274" y="66" width="24" height="3" rx="1.5" fill="#9aa5ce" />
      <rect x="274" y="74" width="16" height="3" rx="1.5" fill="#9aa5ce" />
      <rect x="270" y="100" width="32" height="4" rx="2" fill="#7aa2f7" />
      <rect x="270" y="112" width="32" height="22" rx="4" fill="#1a1b26" />
      <rect x="270" y="142" width="32" height="4" rx="2" fill="#bb9af7" />
      <rect x="270" y="152" width="32" height="20" rx="4" fill="#1a1b26" />
    </svg>
  </div>

  <button
    type="button"
    class="capture__cta"
    data-testid="capture-cta"
    onclick={onContinue}
  >
    Continue
  </button>
</section>

<style>
  .capture {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--tn-sp-6) var(--tn-sp-5);
    min-height: 100%;
    text-align: center;
    gap: var(--tn-sp-4);
  }

  .capture__skip {
    position: absolute;
    top: var(--tn-sp-3);
    right: var(--tn-sp-4);
    min-height: var(--tn-touch-min);
    padding: 0 var(--tn-sp-3);
    background: transparent;
    border: 0;
    color: var(--tn-fg-dim);
    font-size: 14px;
    cursor: pointer;
    border-radius: var(--tn-radius-sm);
  }

  .capture__skip:hover {
    color: var(--tn-fg);
    background: rgba(192, 202, 245, 0.06);
  }

  .capture__skip:focus-visible {
    outline: 2px solid var(--tn-accent-blue);
    outline-offset: 2px;
  }

  .capture__title {
    font-size: 26px;
    line-height: 1.25;
    margin: 0;
    color: var(--tn-fg);
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .capture__desc {
    font-size: 16px;
    line-height: 1.5;
    color: var(--tn-fg-dim);
    margin: 0;
    max-width: 340px;
  }

  .capture__mockup {
    margin: var(--tn-sp-3) 0;
    max-width: 100%;
    overflow: hidden;
  }

  .capture__mockup svg {
    max-width: 100%;
    height: auto;
  }

  .capture__cta {
    margin-top: var(--tn-sp-4);
    width: 100%;
    max-width: 320px;
    min-height: var(--tn-touch-pref);
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

  .capture__cta:hover {
    opacity: 0.92;
  }

  .capture__cta:active {
    transform: scale(0.98);
  }

  .capture__cta:focus-visible {
    outline: 2px solid var(--tn-fg);
    outline-offset: 2px;
  }
</style>
