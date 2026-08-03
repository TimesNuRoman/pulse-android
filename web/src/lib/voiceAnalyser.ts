// SPDX-License-Identifier: Apache-2.0
/**
 * Web Audio API volume analyser.
 *
 * Wraps AudioContext + MediaStreamSource + AnalyserNode and exposes a
 * normalized 0..1 volume reading for the current mic input frame.
 *
 * Used by the voice button (R172) to drive a real-time waveform overlay
 * while the user is recording. The MediaStream source comes from
 * navigator.mediaDevices.getUserMedia() (see voiceRecorder.ts).
 *
 * Graceful fallback: if AudioContext is unavailable (jsdom, ancient webview,
 * or after the user denied permissions before any context was opened) the
 * returned `getVolume()` always returns 0 and `stop()` is a no-op. This
 * matches the behaviour the rest of the editor expects when the audio
 * pipeline is offline: zero signal, no crashes, the UI just shows flat bars.
 */

export interface VoiceAnalyser {
  /** Current frame volume, normalized to [0, 1]. */
  getVolume(): number;
  /** Detach the source and close the AudioContext. Idempotent. */
  stop(): void;
}

interface AnalyserLike {
  fftSize: number;
  getByteFrequencyData: (array: Uint8Array) => void;
  disconnect: () => void;
}

interface AudioContextLike {
  createMediaStreamSource: (stream: MediaStream) => AnalyserLike;
  close: () => Promise<void>;
  state?: string;
}

function resolveAudioContext(): (new () => AudioContextLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: new () => AudioContextLike;
    webkitAudioContext?: new () => AudioContextLike;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Start analysing a MediaStream.
 *
 * The caller owns the stream (it was created via getUserMedia inside
 * voiceRecorder). When `stop()` is called we disconnect the source node
 * and close the context, but we do NOT call `stream.getTracks().stop()`
 * — that's the recorder's responsibility. (Splitting the two prevents
 * the recorder from losing the stream mid-encoding if the analyser
 * happens to be torn down first.)
 */
export function startAnalyser(stream: MediaStream): VoiceAnalyser {
  const Ctor = resolveAudioContext();
  if (!Ctor) {
    return {
      getVolume: () => 0,
      stop: () => {},
    };
  }

  let ctx: AudioContextLike;
  let source: AnalyserLike;
  let buffer: Uint8Array;
  let stopped = false;
  const trackListeners: Array<() => void> = [];

  try {
    ctx = new Ctor();
    source = ctx.createMediaStreamSource(stream);
    // fftSize=64 gives 32 frequency bins. Lower than the default 2048 so the
    // browser doesn't burn cycles on a tiny ui overlay. 32 bins is plenty
    // to drive a 7-bar visualization where each bar averages a few bins.
    source.fftSize = 64;
    buffer = new Uint8Array(source.fftSize / 2);
  } catch {
    // Some browsers throw on createMediaStreamSource if the stream has no
    // audio track (e.g. the user revoked permission between getUserMedia
    // and now). Treat as "no signal" and return a no-op analyser.
    return {
      getVolume: () => 0,
      stop: () => {},
    };
  }

  // Auto-stop when the stream's tracks end. This catches the case where
  // the OS revokes mic access mid-recording (e.g. another app takes
  // over the mic) without waiting for the consumer to notice.
  if (typeof stream.getTracks === 'function') {
    for (const track of stream.getTracks()) {
      const onEnd = (): void => {
        stop();
      };
      track.addEventListener('ended', onEnd);
      trackListeners.push(() => track.removeEventListener('ended', onEnd));
    }
  }

  function getVolume(): number {
    if (stopped) return 0;
    try {
      source.getByteFrequencyData(buffer);
    } catch {
      // The native side can throw if the stream ended between two frames.
      return 0;
    }
    let max = 0;
    for (let i = 0; i < buffer.length; i++) {
      const v = buffer[i] ?? 0;
      if (v > max) max = v;
    }
    return max / 255;
  }

  function stop(): void {
    if (stopped) return;
    stopped = true;
    for (const off of trackListeners) off();
    trackListeners.length = 0;
    try {
      source.disconnect();
    } catch {
      // already disconnected
    }
    // close() returns a promise we deliberately don't await — stop() must
    // be synchronous for the caller's state machine. The context teardown
    // happens in the background; the analyser is already detached.
    void ctx.close().catch(() => {
      // context may already be closed if the tab backgrounded
    });
  }

  return { getVolume, stop };
}
