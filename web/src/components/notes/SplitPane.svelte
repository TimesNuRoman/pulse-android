<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  type Orientation = 'horizontal' | 'vertical';

  interface Props {
    orientation?: Orientation;
    initialRatio?: number;
    minRatio?: number;
    maxRatio?: number;
    persistKey?: string;
    forceMode?: 'auto' | 'mobile' | 'desktop';
    onRatioChange?: (ratio: number) => void;
    children?: import('svelte').Snippet<[string]>;
  }

  let {
    orientation = 'horizontal',
    initialRatio = 0.5,
    minRatio = 0.2,
    maxRatio = 0.8,
    persistKey,
    forceMode = 'auto',
    onRatioChange,
    children,
  }: Props = $props();

  let ratio = $state(initialRatio);
  let dragging = $state(false);
  let containerEl: HTMLDivElement | undefined = $state();
  let internalForceMobile = $state(false);
  let containerWidth = $state(1024);
  let mounted = $state(false);

  const MOBILE_BREAK = 768;
  const isMobile = $derived(forceMode === 'mobile' || (forceMode === 'auto' && (internalForceMobile || containerWidth < MOBILE_BREAK)));

  // Snippet slot name
  const slotName = $derived(orientation === 'horizontal' ? 'right' : 'bottom');

  onMount(() => {
    mounted = true;
    // Restore persisted ratio
    if (persistKey) {
      try {
        const stored = localStorage.getItem(persistKey);
        if (stored) {
          const n = Number(stored);
          if (Number.isFinite(n) && n >= minRatio && n <= maxRatio) {
            ratio = n;
          }
        }
      } catch {
        // localStorage may be unavailable in some envs
      }
    }
    // Media query for mobile detection
    if (typeof window !== 'undefined' && forceMode === 'auto') {
      const mq = window.matchMedia(`(max-width: ${MOBILE_BREAK - 1}px)`);
      internalForceMobile = mq.matches;
      const onChange = (e: MediaQueryListEvent) => {
        internalForceMobile = e.matches;
      };
      mq.addEventListener('change', onChange);
      // Track width
      const ro = new ResizeObserver((entries) => {
        for (const e of entries) containerWidth = e.contentRect.width;
      });
      if (containerEl) ro.observe(containerEl);
      onDestroy(() => {
        mq.removeEventListener('change', onChange);
        ro.disconnect();
      });
    }
  });

  function clamp(n: number): number {
    return Math.max(minRatio, Math.min(maxRatio, n));
  }

  function persist(r: number): void {
    if (!persistKey) return;
    try {
      localStorage.setItem(persistKey, String(r));
    } catch {
      // ignore
    }
  }

  function onPointerDown(e: PointerEvent): void {
    if (isMobile) return;
    dragging = true;
    // setPointerCapture is not in jsdom and may be missing in older browsers.
    const target = e.target as HTMLElement | null;
    if (target && typeof target.setPointerCapture === 'function') {
      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        // ignore — capture is best-effort
      }
    }
    e.preventDefault();
  }

  function onPointerMove(e: PointerEvent): void {
    if (!dragging || !containerEl) return;
    const rect = containerEl.getBoundingClientRect();
    let r: number;
    if (orientation === 'horizontal') {
      const x = e.clientX - rect.left;
      r = x / rect.width;
    } else {
      const y = e.clientY - rect.top;
      r = y / rect.height;
    }
    const clamped = clamp(r);
    if (clamped !== ratio) {
      ratio = clamped;
      onRatioChange?.(clamped);
    }
  }

  function onPointerUp(e: PointerEvent): void {
    if (!dragging) return;
    dragging = false;
    const target = e.target as HTMLElement | null;
    if (target && typeof target.releasePointerCapture === 'function') {
      try {
        target.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
    persist(ratio);
  }

  function onTouchStart(e: TouchEvent): void {
    if (!isMobile || !containerEl) return;
    e.preventDefault();
  }

  function resetRatio(): void {
    ratio = initialRatio;
    persist(ratio);
    onRatioChange?.(ratio);
  }

  function toggleMobilePane(): void {
    // On mobile, "toggle" = set ratio to 0 (top) or 1 (bottom) to fully expand one side.
    // We use 0.95/0.05 to allow the toggle to work without a hard cut.
    ratio = ratio > 0.5 ? 0.05 : 0.95;
    persist(ratio);
    onRatioChange?.(ratio);
  }
</script>

<div
  class="split-pane"
  class:split-pane--horizontal={orientation === 'horizontal' && !isMobile}
  class:split-pane--vertical={orientation === 'vertical' && !isMobile}
  class:split-pane--mobile={isMobile}
  class:split-pane--dragging={dragging}
  data-testid="split-pane"
  data-orientation={orientation}
  data-mode={isMobile ? 'mobile' : 'desktop'}
  data-ratio={ratio}
  bind:this={containerEl}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointerleave={onPointerUp}
  ontouchstart={onTouchStart}
>
  <div
    class="split-pane__pane split-pane__pane--first"
    data-testid="split-pane-first"
    style:flex-basis={isMobile ? '50%' : `${ratio * 100}%`}
  >
    {#if children}
      {@render children('first')}
    {/if}
  </div>
  {#if !isMobile}
    <button
      type="button"
      class="split-pane__handle"
      data-testid="split-pane-handle"
      aria-label="Drag to resize panes"
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={Math.round(minRatio * 100)}
      aria-valuemax={Math.round(maxRatio * 100)}
      role="separator"
      aria-orientation={orientation}
      onpointerdown={onPointerDown}
      ondblclick={resetRatio}
    >
      <span class="split-pane__handle-grip" aria-hidden="true"></span>
    </button>
  {:else}
    <button
      type="button"
      class="split-pane__mobile-toggle"
      data-testid="split-pane-mobile-toggle"
      aria-label="Toggle pane focus"
      onclick={toggleMobilePane}
    >
      <span class="split-pane__mobile-toggle-bar" aria-hidden="true"></span>
    </button>
  {/if}
  <div
    class="split-pane__pane split-pane__pane--second"
    data-testid="split-pane-second"
    style:flex-basis={isMobile ? '50%' : `${(1 - ratio) * 100}%`}
  >
    {#if children}
      {@render children('second')}
    {/if}
  </div>
</div>

<style>
  .split-pane {
    display: flex;
    width: 100%;
    height: 100%;
    min-height: 0;
    position: relative;
    overflow: hidden;
  }
  .split-pane--horizontal { flex-direction: row; }
  .split-pane--vertical { flex-direction: column; }
  .split-pane--mobile { flex-direction: column; }
  .split-pane__pane {
    flex: 1 1 0;
    min-width: 0;
    min-height: 0;
    overflow: auto;
  }
  .split-pane__handle {
    flex: 0 0 12px;
    background: transparent;
    border: 0;
    cursor: col-resize;
    position: relative;
    z-index: 2;
    padding: 0;
  }
  .split-pane--vertical .split-pane__handle { cursor: row-resize; flex-basis: 12px; }
  .split-pane__handle-grip {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 4px;
    background: var(--tn-border, #414868);
    border-radius: 2px;
  }
  .split-pane--vertical .split-pane__handle-grip {
    left: 0;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    width: auto;
    height: 4px;
  }
  .split-pane__handle:hover .split-pane__handle-grip,
  .split-pane--dragging .split-pane__handle-grip {
    background: var(--tn-accent-blue, #7aa2f7);
  }
  .split-pane__mobile-toggle {
    flex: 0 0 32px;
    background: var(--tn-bg-elevated, #24283b);
    border: 0;
    border-top: 1px solid var(--tn-border, #414868);
    border-bottom: 1px solid var(--tn-border, #414868);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    min-height: 32px;
  }
  .split-pane__mobile-toggle-bar {
    width: 40px;
    height: 4px;
    background: var(--tn-fg-muted, #565f89);
    border-radius: 2px;
  }
</style>
