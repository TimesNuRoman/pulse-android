// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import VoiceButton from '../VoiceButton.svelte';

// We replace the recorder factory with a small fake that exposes the
// same surface (`subscribe`/`record`/`stop`/`cancel`/`reset`/`getError`)
// but doesn't actually touch MediaRecorder / getUserMedia.
//
// The fake's initial state is controlled per-test via `setInitialState`.
// Each `record()` call transitions the fake to 'recording'; each
// `stop()` resolves with a 1s clip and pushes 'processing'; the
// consumer is expected to call `reset()` to bring it back to 'idle'.

interface FakeRecorder {
  subscribe: (run: (s: string) => void) => () => void;
  record: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
  getError: ReturnType<typeof vi.fn>;
}

function makeFakeRecorder(initial: 'idle' | 'error' = 'idle', errorCode: string | null = null): FakeRecorder {
  const subscribers = new Set<(s: string) => void>();
  let state: 'idle' | 'requesting' | 'recording' | 'processing' | 'error' = initial;
  let error: string | null = errorCode;
  const push = (next: typeof state): void => {
    state = next;
    subscribers.forEach((s) => s(state));
  };
  return {
    subscribe(run) {
      subscribers.add(run);
      run(state);
      return () => subscribers.delete(run);
    },
    record: vi.fn().mockImplementation(async () => {
      push('recording');
    }),
    stop: vi.fn().mockImplementation(async () => {
      push('processing');
      return {
        blob: new Blob(['x'], { type: 'audio/webm' }),
        duration: 1000,
        mimeType: 'audio/webm',
      };
    }),
    cancel: vi.fn().mockImplementation(() => {
      push('idle');
    }),
    reset: vi.fn().mockImplementation(() => {
      state = 'idle';
      error = null;
      subscribers.forEach((s) => s('idle'));
    }),
    getError: vi.fn().mockImplementation(() => error),
  };
}

let fakeRecorder: FakeRecorder = makeFakeRecorder('idle');

vi.mock('$lib/voiceRecorder', () => ({
  createVoiceRecorder: () => fakeRecorder,
}));

// The analyser is also mocked because we don't want a real rAF loop
// running in tests.
vi.mock('$lib/voiceAnalyser', () => ({
  startAnalyser: vi.fn().mockReturnValue({
    getVolume: () => 0,
    stop: () => {},
  }),
}));

beforeEach(() => {
  fakeRecorder = makeFakeRecorder('idle');
  // Default: getUserMedia is stubbed to resolve with an empty stream so
  // the VoiceButton's $effect for analyser wiring doesn't throw.
  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] } as unknown as MediaStream),
    },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('VoiceButton', () => {
  it('long-press triggers record() after the 200ms threshold', async () => {
    vi.useFakeTimers();
    render(VoiceButton, { props: {} });
    const btn = screen.getByTestId('voice-button');

    await fireEvent.pointerDown(btn);
    // Advance past the 200ms long-press gate so the timer fires.
    vi.advanceTimersByTime(250);
    // record() is async — drain microtasks so the fake's state push runs.
    await vi.advanceTimersByTimeAsync(0);

    expect(fakeRecorder.record).toHaveBeenCalled();
  });

  it('short tap (pointerup before 200ms) shows the "Hold to record" tooltip and does not call record()', async () => {
    vi.useFakeTimers();
    render(VoiceButton, { props: {} });
    const btn = screen.getByTestId('voice-button');

    await fireEvent.pointerDown(btn);
    vi.advanceTimersByTime(50);
    await fireEvent.pointerUp(btn);
    // Drain microtasks so Svelte flushes the showTooltip = true update.
    await vi.advanceTimersByTimeAsync(0);

    expect(screen.getByTestId('voice-button-tooltip')).toBeInTheDocument();
    expect(fakeRecorder.record).not.toHaveBeenCalled();
  });

  it('permission denial surfaces the error state with a "Try again" CTA', async () => {
    // Make the fake recorder start in the 'error' state with the
    // 'permission-denied' code, simulating what the real recorder
    // does when getUserMedia rejects with NotAllowedError.
    fakeRecorder = makeFakeRecorder('error', 'permission-denied');

    render(VoiceButton, { props: { onError: vi.fn() } });

    const err = screen.getByTestId('voice-error');
    expect(err).toBeInTheDocument();
    expect(err.getAttribute('data-error-code')).toBe('permission-denied');
    expect(screen.getByTestId('voice-error-retry')).toBeInTheDocument();
    expect(screen.getByTestId('voice-error-dismiss')).toBeInTheDocument();
  });

  it('renders the "Open settings" button when onOpenSettings is provided and the error is permission-denied', () => {
    fakeRecorder = makeFakeRecorder('error', 'permission-denied');
    const onOpenSettings = vi.fn();
    render(VoiceButton, { props: { onError: vi.fn(), onOpenSettings } });
    const settingsBtn = screen.getByTestId('voice-error-settings');
    expect(settingsBtn).toBeInTheDocument();
  });

  it('does NOT render the "Open settings" button when onOpenSettings is omitted', () => {
    fakeRecorder = makeFakeRecorder('error', 'permission-denied');
    render(VoiceButton, { props: { onError: vi.fn() } });
    expect(screen.queryByTestId('voice-error-settings')).toBeNull();
  });

  it('disables the button when disabled=true', () => {
    render(VoiceButton, { props: { disabled: true } });
    const btn = screen.getByTestId('voice-button');
    expect(btn).toBeDisabled();
  });

  it('exposes aria-label and aria-pressed="false" in the idle state', () => {
    render(VoiceButton, { props: {} });
    const btn = screen.getByTestId('voice-button');
    expect(btn.getAttribute('aria-label')).toBe('Hold to record voice note');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(btn.getAttribute('data-voice-state')).toBe('idle');
  });
});
