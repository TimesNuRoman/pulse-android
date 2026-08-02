<script lang="ts">
  import { tap } from '$lib/haptics';

  interface Props {
    onComplete: () => void;
  }
  let { onComplete }: Props = $props();

  /**
   * R118 — first-launch onboarding.
   *
   * 3 slides, horizontal pager, dark-only. Persists completion to
   * `pulse.onboarded` (default false). Skip completes immediately; Next
   * advances; "Get started" on the last slide completes. The parent
   * (App.svelte) reads the same key to decide which view to mount.
   *
   * Replaces the R85+ OnboardingFlow in `components/onboarding/` — that
   * flow was 4 screens keyed to a now-stale product surface (Welcome →
   * Capture → SmartEngine → LocalFirst). R118 collapses it to 3 slides
   * that match the current Pulse: local notes, voice capture, markdown
   * with [[wikilinks]].
   */
  const STORAGE_KEY = 'pulse.onboarded';
  const SLIDE_COUNT = 3;
  type SlideIndex = 0 | 1 | 2;

  const slides: { title: string; body: string }[] = [
    {
      title: 'Local-first',
      body: 'Your notes never leave the device. No accounts, no cloud, no sync.',
    },
    {
      title: 'Voice + AI',
      body: 'Tap the mic, talk, get an answer — all on-device.',
    },
    {
      title: 'Markdown + [[wikilinks]]',
      body: 'Your knowledge graph. Link notes with [[double brackets]] and a backlink is yours.',
    },
  ];

  let current: SlideIndex = $state(0);
  const isLast = $derived(current === SLIDE_COUNT - 1);

  function persistComplete(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // quota / private mode — caller still routes off the flow
    }
  }

  function next(): void {
    void tap('selection');
    if (isLast) {
      persistComplete();
      onComplete();
      return;
    }
    current = (current + 1) as SlideIndex;
  }

  function prev(): void {
    void tap('selection');
    if (current === 0) return;
    current = (current - 1) as SlideIndex;
  }

  function skip(): void {
    void tap('light');
    persistComplete();
    onComplete();
  }

  function getStarted(): void {
    void tap('medium');
    persistComplete();
    onComplete();
  }

  function dotGo(i: number): void {
    if (i < 0 || i >= SLIDE_COUNT) return;
    current = i as SlideIndex;
  }
</script>

<div
  class="onboarding-view"
  data-testid="onboarding-view"
  data-current={current}
>
  <div
    class="onboarding-view__track"
    data-testid="onboarding-track"
    style="--onboarding-offset: {current * 100}%;"
  >
    {#each slides as slide, i (i)}
      <section
        class="onboarding-view__panel"
        data-testid={`onboarding-panel-${i}`}
        aria-labelledby={`onboarding-h-${i}`}
      >
        <h2 class="onboarding-view__title" id={`onboarding-h-${i}`}>
          {slide.title}
        </h2>
        <p class="onboarding-view__body">{slide.body}</p>
      </section>
    {/each}
  </div>

  <div class="onboarding-view__dots" data-testid="onboarding-dots" aria-hidden="true">
    {#each Array(SLIDE_COUNT) as _, i (i)}
      <span
        class="onboarding-view__dot"
        class:onboarding-view__dot--active={current === i}
        data-testid={`onboarding-dot-${i}`}
      ></span>
    {/each}
  </div>

  <div class="onboarding-view__actions">
    <button
      type="button"
      class="btn btn--ghost onboarding-view__btn onboarding-view__btn--skip"
      onclick={skip}
      data-testid="onboarding-skip"
    >
      Skip
    </button>
    <button
      type="button"
      class="btn btn--ghost onboarding-view__btn onboarding-view__btn--prev"
      onclick={prev}
      disabled={current === 0}
      data-testid="onboarding-prev"
      aria-label="Previous slide"
    >
      Back
    </button>
    {#if isLast}
      <button
        type="button"
        class="btn btn--primary onboarding-view__btn onboarding-view__btn--cta"
        onclick={getStarted}
        data-testid="onboarding-cta"
      >
        Get started
      </button>
    {:else}
      <button
        type="button"
        class="btn btn--primary onboarding-view__btn onboarding-view__btn--next"
        onclick={next}
        data-testid="onboarding-next"
      >
        Next
      </button>
    {/if}
  </div>
</div>

<style>
  .onboarding-view {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100vh;
    height: 100dvh;
    background: var(--tn-bg, #1a1b26);
    color: var(--tn-fg, #c0caf5);
    overflow: hidden;
  }

  .onboarding-view__track {
    display: flex;
    flex: 1 1 auto;
    width: 300%; /* SLIDE_COUNT * 100% */
    transform: translateX(calc(-1 * var(--onboarding-offset, 0%)));
    transition: transform 220ms cubic-bezier(0.4, 0, 0.2, 1);
    will-change: transform;
  }

  .onboarding-view__panel {
    flex: 0 0 33.3333%; /* 1 / SLIDE_COUNT */
    height: 100%;
    padding: 24px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    gap: 16px;
  }

  .onboarding-view__title {
    margin: 0;
    font-size: 24px;
    font-weight: 600;
    color: var(--tn-fg, #c0caf5);
  }

  .onboarding-view__body {
    margin: 0;
    font-size: 16px;
    line-height: 1.5;
    color: var(--tn-fg-dim, #9aa5ce);
    max-width: 360px;
  }

  .onboarding-view__dots {
    display: flex;
    justify-content: center;
    gap: 8px;
    padding: 12px 0;
    background: var(--tn-bg, #1a1b26);
  }

  .onboarding-view__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--tn-border, #414868);
    transition: background-color 0.15s;
  }

  .onboarding-view__dot--active {
    background: var(--tn-accent-blue, #7aa2f7);
  }

  .onboarding-view__actions {
    display: flex;
    gap: 8px;
    padding: 16px;
    border-top: 1px solid var(--tn-border, #414868);
    background: var(--tn-bg-elevated, #24283b);
    padding-bottom: calc(16px + env(safe-area-inset-bottom, 0));
  }

  .onboarding-view__btn {
    min-height: var(--tn-touch-min, 44px);
    min-width: var(--tn-touch-min, 44px);
  }

  .onboarding-view__btn--skip {
    margin-right: auto;
  }

  .onboarding-view__btn--prev[disabled] {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .onboarding-view__btn--cta,
  .onboarding-view__btn--next {
    margin-left: auto;
  }

  @media (prefers-reduced-motion: reduce) {
    .onboarding-view__track {
      transition: none;
    }
  }
</style>
