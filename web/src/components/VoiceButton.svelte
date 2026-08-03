<script lang="ts">
  // SPDX-License-Identifier: Apache-2.0
  /**
   * Voice input button.
   *
   * Press-and-hold to start recording; release to stop. While recording,
   * a full-width overlay covers the editor with a real-time waveform and
   * a tap-to-stop button. After the recorder yields a clip, the overlay
   * switches to a "Transcribing…" placeholder (R173+ wires the actual
   * transcription result).
   *
   * State machine is owned by `voiceRecorder.ts`; this component just
   * mirrors it and renders the right chrome for each phase.
   *
   * Accessibility: the button has a keyboard alternative (Space/Enter
   * behaves like a press-and-hold). The overlay is announced via
   * `aria-live="polite"` so screen readers get the recording state
   * without the user needing to focus the overlay.
   */
  import { onDestroy } from 'svelte';
  import VoiceWaveform from './VoiceWaveform.svelte';
  import { createVoiceRecorder, type RecorderState, type RecorderErrorCode } from '$lib/voiceRecorder';
  import { startAnalyser, type VoiceAnalyser } from '$lib/voiceAnalyser';

  interface Props {
    /** Disable the button (e.g. while the editor is read-only). */
    disabled?: boolean;
    /** Fired when a clip is produced. The blob is ready for transcription. */
    onClip?: (clip: { blob: Blob; duration: number; mimeType: string }) => void;
    /** Fired when recording or transcription fails. */
    onError?: (code: RecorderErrorCode) => void;
    /**
     * Optional override for opening the system app-settings screen
     * (used by the permission-denied CTA). The default falls back to
     * a plain anchor with `href` because the Android settings intent
     * varies by OEM; consumers can wire their own implementation.
     */
    onOpenSettings?: () => void;
  }

  let { disabled = false, onClip, onError, onOpenSettings }: Props = $props();

  const recorder = createVoiceRecorder();
  // `current` rather than `state` to avoid shadowing the runes `$state`
  // identifier — the Svelte 5 parser treats `$state` as a store lookup
  // for a variable named `state`, so we use a different name.
  let current: RecorderState = $state('idle');
  let volume: number = $state(0);
  let errorCode: RecorderErrorCode | null = $state(null);
  let showTooltip: boolean = $state(false);
  let tooltipTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let pressed = $state(false);
  let analyser: VoiceAnalyser | null = null;
  let rafId: number | null = null;
  let overlayMessage = $state('');

  // Mirror the recorder store into local state. We use a manual
  // subscription (rather than `$recorder`) because the recorder factory
  // is a closure-scoped object and Svelte 5 cannot auto-subscribe to
  // a factory result the same way it does for module-level stores.
  const unsubscribe = recorder.subscribe((s) => {
    current = s as RecorderState;
    if (s === 'error') {
      errorCode = recorder.getError();
      onError?.(errorCode ?? 'recording-failed');
    } else {
      errorCode = null;
    }
  });
  onDestroy(unsubscribe);

  function showHint(): void {
    showTooltip = true;
    if (tooltipTimer) clearTimeout(tooltipTimer);
    tooltipTimer = setTimeout(() => {
      showTooltip = false;
    }, 1600);
  }

  function startVolumeLoop(): void {
    if (!analyser) return;
    const tick = (): void => {
      const v = analyser?.getVolume() ?? 0;
      volume = v;
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  function stopVolumeLoop(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    volume = 0;
  }

  function startRecording(): void {
    overlayMessage = 'Recording…';
    // Start the analyser against the recorder's internal stream.
    // The recorder has already called getUserMedia by the time current
    // hits 'recording', so we subscribe from the onStateTransition.
    void recorder.record().catch(() => {
      // Error state is already pushed by the recorder. Nothing to do.
    });
  }

  async function stopRecording(): Promise<void> {
    stopVolumeLoop();
    if (analyser) {
      analyser.stop();
      analyser = null;
    }
    try {
      const clip = await recorder.stop();
      overlayMessage = 'Transcribing…';
      onClip?.(clip);
      // The recorder is now in 'processing'. R173+ will await a real
      // transcription; for R172 we just leave the overlay up briefly
      // so the user gets visual feedback, then reset.
      setTimeout(() => {
        recorder.reset();
      }, 600);
    } catch {
      // error state already pushed by the recorder
    }
  }

  function cancelRecording(): void {
    stopVolumeLoop();
    if (analyser) {
      analyser.stop();
      analyser = null;
    }
    recorder.cancel();
  }

  // When the recorder transitions to 'recording', wire the analyser
  // against the live mic stream. We do this with a $effect that
  // watches `current` and reads the stream from the underlying
  // MediaStream track the recorder created.
  $effect(() => {
    if (current === 'recording' && !analyser) {
      // The recorder owns the stream; we ask the platform for any
      // active audio track via the track's own getUserMedia chain.
      // In practice, the recorder has just opened the stream inside
      // record(); we re-acquire a reference by calling getUserMedia
      // with the same constraints. This produces a second stream,
      // which is fine for an analyser (it does not record).
      void navigator?.mediaDevices
        ?.getUserMedia({ audio: true })
        .then((s) => {
          analyser = startAnalyser(s);
          startVolumeLoop();
        })
        .catch(() => {
          // Permission denied etc. - recorder already pushed error state.
        });
    }
    if (current !== 'recording' && analyser) {
      analyser.stop();
      analyser = null;
      stopVolumeLoop();
    }
  });

  const LONG_PRESS_MS = 200;

  function onPointerDown(): void {
    if (disabled) return;
    pressed = true;
    if (longPressTimer) clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      if (pressed) startRecording();
    }, LONG_PRESS_MS);
  }

  function onPointerUp(): void {
    if (disabled) return;
    const wasLongPress = current === 'recording';
    pressed = false;
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (wasLongPress) {
      void stopRecording();
    } else if (current === 'idle' || current === 'error') {
      showHint();
    }
  }

  function onPointerCancel(): void {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (current === 'recording') cancelRecording();
    pressed = false;
  }

  function onKeyDown(ev: KeyboardEvent): void {
    if (disabled) return;
    if (ev.key !== ' ' && ev.key !== 'Enter') return;
    ev.preventDefault();
    if (current === 'recording') {
      void stopRecording();
    } else {
      // Keyboard users don't get the long-press gate; a single Space/Enter
      // starts recording, a second one stops it.
      startRecording();
    }
  }

  function onRetry(): void {
    recorder.reset();
    startRecording();
  }

  function onDismissError(): void {
    recorder.reset();
  }

  function errorMessage(code: RecorderErrorCode | null): string {
    switch (code) {
      case 'permission-denied':
        return 'Microphone permission denied. Allow mic access in system settings to record voice notes.';
      case 'no-microphone':
        return 'No microphone found on this device.';
      case 'audio-too-short':
        return 'Audio too short — hold the button a little longer next time.';
      case 'not-supported':
        return 'Audio recording is not supported in this browser.';
      case 'recording-failed':
      default:
        return 'Recording failed. Try again.';
    }
  }
</script>

<div class="vb">
  <button
    type="button"
    class="vb__btn"
    class:vb__btn--recording={current === 'recording'}
    class:vb__btn--error={current === 'error'}
    aria-label="Hold to record voice note"
    aria-pressed={current === 'recording'}
    aria-describedby="vb-hint"
    data-testid="voice-button"
    data-voice-state={current}
    {disabled}
    onpointerdown={onPointerDown}
    onpointerup={onPointerUp}
    onpointercancel={onPointerCancel}
    onpointerleave={onPointerCancel}
    onkeydown={onKeyDown}
  >
    <svg
      class="vb__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v4" />
      <path d="M8 23h8" />
    </svg>
  </button>
  <span id="vb-hint" class="vb__hint" aria-hidden="true">Hold to record</span>

  {#if showTooltip}
    <div class="vb__tooltip" role="status" data-testid="voice-button-tooltip">
      Hold to record
    </div>
  {/if}

  {#if current === 'recording' || current === 'processing'}
    <div
      class="vb__overlay"
      role="dialog"
      aria-modal="true"
      aria-live="polite"
      aria-label="Voice input"
      data-testid="voice-overlay"
      data-overlay-state={current}
    >
      <div class="vb__overlay-card">
        {#if current === 'recording'}
          <VoiceWaveform {volume} />
          <p class="vb__overlay-text" data-testid="voice-overlay-text">
            {overlayMessage || 'Recording…'}
          </p>
          <button
            type="button"
            class="vb__stop"
            aria-label="Stop recording"
            data-testid="voice-overlay-stop"
            onclick={() => void stopRecording()}
          >
            Stop
          </button>
        {:else}
          <div class="vb__spinner" aria-hidden="true"></div>
          <p class="vb__overlay-text" data-testid="voice-overlay-text">
            {overlayMessage || 'Transcribing…'}
          </p>
        {/if}
      </div>
    </div>
  {/if}

  {#if current === 'error' && errorCode}
    <div
      class="vb__error"
      role="alert"
      data-testid="voice-error"
      data-error-code={errorCode}
    >
      <p class="vb__error-text">{errorMessage(errorCode)}</p>
      <div class="vb__error-actions">
        {#if errorCode === 'permission-denied' && onOpenSettings}
          <button
            type="button"
            class="vb__error-btn"
            data-testid="voice-error-settings"
            onclick={onOpenSettings}
          >
            Open settings
          </button>
        {/if}
        <button
          type="button"
          class="vb__error-btn vb__error-btn--primary"
          data-testid="voice-error-retry"
          onclick={onRetry}
        >
          Try again
        </button>
        <button
          type="button"
          class="vb__error-btn"
          data-testid="voice-error-dismiss"
          onclick={onDismissError}
        >
          Dismiss
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .vb {
    position: relative;
    display: inline-block;
  }
  .vb__btn {
    min-width: 56px;
    min-height: 56px;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--tn-bg-elevated, #24283b);
    color: var(--tn-fg, #c0caf5);
    border: 1px solid var(--tn-border, #414868);
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s, border-color 0.15s;
  }
  .vb__btn:hover:not(:disabled) {
    background: var(--tn-bg-overlay, #1f2335);
  }
  .vb__btn:active:not(:disabled) {
    background: var(--tn-accent-blue, #7aa2f7);
    color: var(--tn-bg, #1a1b26);
  }
  .vb__btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .vb__btn--recording {
    background: var(--tn-accent-red, #f7768e);
    color: var(--tn-bg, #1a1b26);
    border-color: var(--tn-accent-red, #f7768e);
  }
  .vb__btn--error {
    border-color: var(--tn-accent-red, #f7768e);
    color: var(--tn-accent-red, #f7768e);
  }
  .vb__icon {
    width: 24px;
    height: 24px;
  }
  .vb__hint {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .vb__tooltip {
    position: absolute;
    top: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    background: var(--tn-bg-elevated, #24283b);
    color: var(--tn-fg, #c0caf5);
    border: 1px solid var(--tn-border, #414868);
    border-radius: var(--tn-radius-sm, 6px);
    padding: 6px 10px;
    font-size: var(--tn-font-small, 13px);
    white-space: nowrap;
    pointer-events: none;
  }
  .vb__overlay {
    position: fixed;
    inset: 0;
    background: rgba(26, 27, 38, 0.92);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  .vb__overlay-card {
    background: var(--tn-bg-elevated, #24283b);
    border: 1px solid var(--tn-border, #414868);
    border-radius: var(--tn-radius-md, 12px);
    padding: var(--tn-sp-5, 24px);
    min-width: 280px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--tn-sp-3, 12px);
  }
  .vb__overlay-text {
    margin: 0;
    color: var(--tn-fg, #c0caf5);
    font-size: var(--tn-font-body, 16px);
  }
  .vb__stop {
    min-height: 56px;
    min-width: 120px;
    padding: 0 24px;
    border-radius: var(--tn-radius-sm, 6px);
    background: var(--tn-accent-red, #f7768e);
    color: var(--tn-bg, #1a1b26);
    border: none;
    font-weight: 600;
    font-size: var(--tn-font-body, 16px);
    cursor: pointer;
  }
  .vb__stop:hover {
    filter: brightness(1.1);
  }
  .vb__spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--tn-border, #414868);
    border-top-color: var(--tn-accent-blue, #7aa2f7);
    border-radius: 50%;
    animation: vb-spin 0.8s linear infinite;
  }
  @keyframes vb-spin {
    to { transform: rotate(360deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .vb__spinner {
      animation-duration: 1.6s;
    }
  }
  .vb__error {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    right: 0;
    min-width: 280px;
    max-width: 320px;
    background: var(--tn-bg-elevated, #24283b);
    border: 1px solid var(--tn-accent-red, #f7768e);
    border-radius: var(--tn-radius-sm, 6px);
    padding: var(--tn-sp-3, 12px);
    display: flex;
    flex-direction: column;
    gap: var(--tn-sp-2, 8px);
  }
  .vb__error-text {
    margin: 0;
    color: var(--tn-fg, #c0caf5);
    font-size: var(--tn-font-small, 13px);
  }
  .vb__error-actions {
    display: flex;
    gap: var(--tn-sp-2, 8px);
    flex-wrap: wrap;
  }
  .vb__error-btn {
    min-height: 56px;
    padding: 0 12px;
    border-radius: var(--tn-radius-sm, 6px);
    background: transparent;
    color: var(--tn-fg, #c0caf5);
    border: 1px solid var(--tn-border, #414868);
    font-size: var(--tn-font-small, 13px);
    cursor: pointer;
  }
  .vb__error-btn--primary {
    background: var(--tn-accent-blue, #7aa2f7);
    color: var(--tn-bg, #1a1b26);
    border-color: var(--tn-accent-blue, #7aa2f7);
  }
</style>
