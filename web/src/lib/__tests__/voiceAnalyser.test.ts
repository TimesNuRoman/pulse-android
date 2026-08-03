// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startAnalyser } from '../voiceAnalyser';

interface MockAnalyser {
  fftSize: number;
  getByteFrequencyData: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

interface MockAudioContext {
  createMediaStreamSource: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  state: string;
}

function buildMocks(opts: {
  /** Per-call bytes the analyser returns. Pass an array of arrays to
   *  drive multiple frames. */
  bytes?: number[][];
  throwOnClose?: boolean;
} = {}): {
  ctx: MockAudioContext;
  source: MockAnalyser;
  stream: MediaStream;
  restore: () => void;
} {
  const bytesQueue = opts.bytes ? [...opts.bytes] : [];
  const source: MockAnalyser = {
    fftSize: 0,
    getByteFrequencyData: vi.fn((buf: Uint8Array) => {
      const next = bytesQueue.shift();
      if (next) {
        for (let i = 0; i < next.length && i < buf.length; i++) {
          buf[i] = next[i] ?? 0;
        }
      } else {
        buf.fill(0);
      }
    }),
    disconnect: vi.fn(),
  };
  const ctx: MockAudioContext = {
    createMediaStreamSource: vi.fn().mockReturnValue(source),
    close: vi.fn().mockImplementation(() => {
      if (opts.throwOnClose) return Promise.reject(new Error('close-failed'));
      return Promise.resolve();
    }),
    state: 'running',
  };
  const Ctor = vi.fn().mockImplementation(() => ctx);
  const original = (window as unknown as { AudioContext?: unknown }).AudioContext;
  (window as unknown as { AudioContext: unknown }).AudioContext = Ctor;

  // jsdom's MediaStream is just a constructor with a no-arg body, so
  // we hand back a plain object. The analyser only calls createMediaStreamSource
  // (which we've already mocked), so the stream itself never gets touched.
  const stream = {} as MediaStream;

  return {
    ctx,
    source,
    stream,
    restore: () => {
      if (original === undefined) {
        delete (window as unknown as { AudioContext?: unknown }).AudioContext;
      } else {
        (window as unknown as { AudioContext: unknown }).AudioContext = original;
      }
    },
  };
}

describe('voiceAnalyser', () => {
  let rafCallbacks: Array<() => void> = [];
  let originalRAF: typeof requestAnimationFrame;
  let originalCAF: typeof cancelAnimationFrame;

  beforeEach(() => {
    rafCallbacks = [];
    originalRAF = globalThis.requestAnimationFrame;
    originalCAF = globalThis.cancelAnimationFrame;
    // The analyser doesn't drive rAF itself — the consumer does. These
    // tests just call getVolume() directly, so we don't need a real rAF.
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafCallbacks.push(() => cb(performance.now()));
      return rafCallbacks.length;
    }) as unknown as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => {}) as unknown as typeof cancelAnimationFrame;
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRAF;
    globalThis.cancelAnimationFrame = originalCAF;
  });

  it('getVolume() returns 0 when the analyser reports all-zero bytes', () => {
    const m = buildMocks();
    const a = startAnalyser(m.stream);
    expect(a.getVolume()).toBe(0);
    m.restore();
  });

  it('getVolume() returns a normalized 0..1 value from mock byte data', () => {
    // 32 bins (fftSize/2). Set the max bin to 255 -> should normalize to 1.
    const m = buildMocks({ bytes: [new Array(32).fill(0).map((_, i) => (i === 7 ? 255 : 0))] });
    const a = startAnalyser(m.stream);
    expect(a.getVolume()).toBe(1);
    m.restore();
  });

  it('getVolume() scales linearly with the max byte value', () => {
    const m = buildMocks({ bytes: [new Array(32).fill(0).map((_, i) => (i === 0 ? 128 : 0))] });
    const a = startAnalyser(m.stream);
    // 128/255 = 0.5019... (accept ±1% tolerance for float rounding)
    expect(a.getVolume()).toBeCloseTo(128 / 255, 2);
    m.restore();
  });

  it('startAnalyser() wires AudioContext + MediaStreamSource + AnalyserNode', () => {
    const m = buildMocks();
    startAnalyser(m.stream);
    expect(m.ctx.createMediaStreamSource).toHaveBeenCalledTimes(1);
    expect(m.ctx.createMediaStreamSource).toHaveBeenCalledWith(m.stream);
    // fftSize is set on the source node (which IS the analyser in our mock).
    expect(m.source.fftSize).toBe(64);
    m.restore();
  });

  it('stop() disconnects the source and closes the AudioContext', () => {
    const m = buildMocks();
    const a = startAnalyser(m.stream);
    a.stop();
    expect(m.source.disconnect).toHaveBeenCalledTimes(1);
    expect(m.ctx.close).toHaveBeenCalledTimes(1);
    m.restore();
  });

  it('stop() is idempotent — second call is a no-op', () => {
    const m = buildMocks();
    const a = startAnalyser(m.stream);
    a.stop();
    a.stop();
    a.stop();
    expect(m.source.disconnect).toHaveBeenCalledTimes(1);
    expect(m.ctx.close).toHaveBeenCalledTimes(1);
    m.restore();
  });

  it('returns a no-op analyser when AudioContext is unavailable (jsdom fallback)', () => {
    const original = (window as unknown as { AudioContext?: unknown }).AudioContext;
    const originalWebkit = (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext;
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    delete (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext;
    try {
      const a = startAnalyser({} as MediaStream);
      expect(a.getVolume()).toBe(0);
      // stop() must not throw
      expect(() => a.stop()).not.toThrow();
    } finally {
      (window as unknown as { AudioContext?: unknown }).AudioContext = original;
      (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext = originalWebkit;
    }
  });

  it('getVolume() returns 0 after stop() even if getByteFrequencyData is called', () => {
    const m = buildMocks({ bytes: [new Array(32).fill(255)] });
    const a = startAnalyser(m.stream);
    expect(a.getVolume()).toBe(1);
    a.stop();
    // After stop, getVolume is hard-locked to 0 — we don't call into
    // the source again. This avoids touching a disconnected node.
    expect(a.getVolume()).toBe(0);
    // getByteFrequencyData should NOT have been called again after stop().
    expect(m.source.getByteFrequencyData).toHaveBeenCalledTimes(1);
    m.restore();
  });

  it('auto-stops when the underlying MediaStream track fires "ended"', () => {
    const m = buildMocks();
    // Build a stream that exposes a track with an EventTarget-style
    // addEventListener. The analyser should attach and tear down on end.
    const listeners: Array<() => void> = [];
    const track = {
      addEventListener: (event: string, cb: () => void) => {
        if (event === 'ended') listeners.push(cb);
      },
      removeEventListener: (event: string, cb: () => void) => {
        if (event !== 'ended') return;
        const i = listeners.indexOf(cb);
        if (i >= 0) listeners.splice(i, 1);
      },
    };
    const streamWithTrack = { getTracks: () => [track] } as unknown as MediaStream;
    const a = startAnalyser(streamWithTrack);
    expect(m.source.disconnect).not.toHaveBeenCalled();
    // Simulate the track ending — the analyser should call stop() internally.
    listeners.forEach((cb) => cb());
    expect(m.source.disconnect).toHaveBeenCalledTimes(1);
    expect(m.ctx.close).toHaveBeenCalledTimes(1);
    m.restore();
    // Drain any background promise from close() to keep the test tidy.
    a.stop();
  });
});
