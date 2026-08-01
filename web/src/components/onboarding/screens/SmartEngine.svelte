<script lang="ts">
  interface Props {
    onContinue: () => void;
    onSkip: () => void;
  }

  let { onContinue, onSkip }: Props = $props();

  // Stats come from R79/R82 — shown in the onboarding card to anchor the
  // "Smart Engine" claim in measurable, testable numbers (Roman: no fluff).
  const stats = [
    { label: 'Pass-rate lift', value: '+32%' },
    { label: 'Tree-sitter parse p50', value: '0.85ms' },
    { label: 'Auto-route threshold', value: '5 / 7' },
  ];
</script>

<section
  class="se3"
  data-testid="screen-smart-engine"
  data-screen="smart-engine"
  aria-labelledby="se3-title"
>
  <button
    type="button"
    class="se3__skip"
    data-testid="se3-skip"
    onclick={onSkip}
    aria-label="Skip onboarding"
  >
    Skip
  </button>

  <h1 id="se3-title" class="se3__title" data-testid="se3-title">Smart Engine v3</h1>

  <p class="se3__desc" data-testid="se3-desc">
    Your requests route automatically. Code, voice, search — Pulse picks the right tool.
  </p>

  <div class="se3__stats" data-testid="se3-stats" role="list" aria-label="Smart Engine v3 benchmark stats">
    {#each stats as stat (stat.label)}
      <div class="se3__stat" role="listitem" data-testid="se3-stat-{stat.label}">
        <div class="se3__stat-value">{stat.value}</div>
        <div class="se3__stat-label">{stat.label}</div>
      </div>
    {/each}
  </div>

  <p class="se3__footnote" data-testid="se3-footnote">
    Tree-sitter signals boost code-edit pass-rate from 20% to 88% on the 25-prompt smoke suite.
  </p>

  <button
    type="button"
    class="se3__cta"
    data-testid="se3-cta"
    onclick={onContinue}
  >
    Continue
  </button>
</section>

<style>
  .se3 {
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

  .se3__skip {
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

  .se3__skip:hover {
    color: var(--tn-fg);
    background: rgba(192, 202, 245, 0.06);
  }

  .se3__skip:focus-visible {
    outline: 2px solid var(--tn-accent-blue);
    outline-offset: 2px;
  }

  .se3__title {
    font-size: 26px;
    line-height: 1.25;
    margin: 0;
    color: var(--tn-fg);
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .se3__desc {
    font-size: 16px;
    line-height: 1.5;
    color: var(--tn-fg-dim);
    margin: 0;
    max-width: 340px;
  }

  .se3__stats {
    display: flex;
    flex-direction: column;
    gap: var(--tn-sp-2);
    width: 100%;
    max-width: 320px;
    background: var(--tn-bg-elevated);
    border: 1px solid var(--tn-border);
    border-radius: var(--tn-radius-md);
    padding: var(--tn-sp-3) var(--tn-sp-4);
    margin-top: var(--tn-sp-2);
  }

  .se3__stat {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--tn-sp-3);
  }

  .se3__stat-value {
    font-family: var(--tn-font-mono);
    font-size: 18px;
    font-weight: 600;
    color: var(--tn-accent-blue);
  }

  .se3__stat-label {
    font-size: 13px;
    color: var(--tn-fg-dim);
    text-align: right;
  }

  .se3__footnote {
    font-size: 12px;
    line-height: 1.45;
    color: var(--tn-fg-muted);
    margin: 0;
    max-width: 320px;
    font-family: var(--tn-font-mono);
  }

  .se3__cta {
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

  .se3__cta:hover {
    opacity: 0.92;
  }

  .se3__cta:active {
    transform: scale(0.98);
  }

  .se3__cta:focus-visible {
    outline: 2px solid var(--tn-fg);
    outline-offset: 2px;
  }
</style>
