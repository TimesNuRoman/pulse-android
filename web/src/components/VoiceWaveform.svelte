<script lang="ts">
  // SPDX-License-Identifier: Apache-2.0
  /**
   * Real-time mic input waveform. Pure CSS — no canvas, no SVG.
   *
   * `volume` is a normalized 0..1 reading from voiceAnalyser. Each bar's
   * height is `scaleY(0.15 + volume * 0.85)` so silence still shows a
   * baseline (flat 15% bars) and the visualization is visible at all
   * amplitudes.
   *
   * Per-bar delay gives a staggered bounce so the cluster doesn't look
   * like a single bar moving. The scaleY transform is GPU-composited,
   * which is what the spec asks for (no layout/paint per frame).
   */
  interface Props {
    volume: number;
    bars?: number;
  }

  let { volume, bars = 7 }: Props = $props();

  // Clamp to [0, 1] so a buggy upstream cannot push the layout off-screen.
  const safeVolume = $derived(Math.max(0, Math.min(1, volume)));
  const scale = $derived(0.15 + safeVolume * 0.85);

  // 7 evenly-spaced phase delays. Using staggered delays produces a
  // soft "rolling" feel even at constant volume, which reads better
  // than synchronized bars.
  const phases = $derived.by(() => {
    const out: number[] = [];
    for (let i = 0; i < bars; i++) {
      out.push((i / bars) * 0.6);
    }
    return out;
  });
</script>

<div
  class="vwf"
  role="img"
  aria-label="Voice input waveform"
  aria-live="polite"
  data-testid="voice-waveform"
>
  {#each phases as phase, i (i)}
    <span
      class="vwf__bar"
      style="--vwf-scale: {scale}; --vwf-delay: {phase}s;"
      data-testid={`voice-waveform-bar-${i}`}
    ></span>
  {/each}
</div>

<style>
  .vwf {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-height: 56px;
    padding: 8px 12px;
  }
  .vwf__bar {
    display: inline-block;
    width: 4px;
    height: 28px;
    border-radius: 2px;
    background: var(--tn-accent-blue, #7aa2f7);
    transform-origin: center;
    transform: scaleY(var(--vwf-scale, 0.15));
    /* The pulse adds motion even when volume is steady. The 60fps comes
       from scaleY being a compositor-only property. */
    animation: vwf-pulse 1.2s ease-in-out infinite;
    animation-delay: var(--vwf-delay, 0s);
    will-change: transform;
  }
  @keyframes vwf-pulse {
    0%, 100% { opacity: 0.85; }
    50% { opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .vwf__bar {
      animation: none;
    }
  }
</style>
