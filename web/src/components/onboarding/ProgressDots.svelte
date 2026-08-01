<script lang="ts">
  import { SCREEN_COUNT, type ScreenIndex } from './onboardingStore';

  interface Props {
    current: ScreenIndex;
    total?: number;
    onDotClick?: (idx: ScreenIndex) => void;
  }

  let { current, total = SCREEN_COUNT, onDotClick }: Props = $props();

  const indices = $derived(Array.from({ length: total }, (_, i) => i as ScreenIndex));

  function handleClick(idx: ScreenIndex): void {
    onDotClick?.(idx);
  }
</script>

<nav
  class="progress-dots"
  data-testid="progress-dots"
  aria-label="Onboarding progress ({current + 1} of {total})"
>
  {#each indices as idx (idx)}
    {@const isActive = idx === current}
    <button
      type="button"
      class="progress-dots__dot"
      class:progress-dots__dot--active={isActive}
      data-testid="progress-dot-{idx}"
      data-active={isActive ? 'true' : 'false'}
      aria-label="Go to screen {idx + 1}"
      aria-current={isActive ? 'step' : undefined}
      onclick={() => handleClick(idx)}
    ></button>
  {/each}
</nav>

<style>
  .progress-dots {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: var(--tn-sp-3);
    padding: var(--tn-sp-3) 0;
  }

  .progress-dots__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--tn-border);
    border: 0;
    padding: 0;
    margin: 0;
    cursor: pointer;
    /* M3 spec: 24dp active dot, 8dp inactive. We achieve active via scale. */
    transition:
      width 200ms cubic-bezier(0.4, 0, 0.2, 1),
      background-color 200ms cubic-bezier(0.4, 0, 0.2, 1),
      transform 200ms cubic-bezier(0.4, 0, 0.2, 1);
    /* Hit area expansion without visual change (M3 48dp touch target). */
    position: relative;
  }

  .progress-dots__dot::before {
    content: '';
    position: absolute;
    inset: -20px;
    /* The dot itself stays 8px / 24px; the hit area is 48dp. */
  }

  .progress-dots__dot--active {
    width: 24px;
    background: var(--tn-accent-blue);
    border-radius: 12px;
    transform: translateY(0);
  }

  .progress-dots__dot:hover:not(.progress-dots__dot--active) {
    background: var(--tn-fg-muted);
  }

  .progress-dots__dot:focus-visible {
    outline: 2px solid var(--tn-accent-blue);
    outline-offset: 4px;
  }
</style>
