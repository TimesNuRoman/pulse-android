// SPDX-License-Identifier: Apache-2.0
/**
 * MediaRecorder wrapper with a tiny state machine.
 *
 * Why a separate file from `voice/recognition.ts`:
 *   - `voice/recognition.ts` wraps a Capacitor plugin that streams partial
 *     transcription results from the OS speech-to-text engine. It does not
 *     give us the raw audio bytes, so we can't visualize the input.
 *   - This module wraps the browser `MediaRecorder` + `getUserMedia` so we
 *     can (a) produce a real-time volume reading for the waveform, and
 *     (b) hand off a recorded audio Blob to a future transcription stage
 *     (R173+).
 *
 * State machine:
 *   idle -> requesting -> recording -> processing -> idle
 *                       \-> error (from any step)
 *
 * Permission failures and "audio too short" both flow through `error`
 * with a code, so the UI can render the right inline message.
 */

import { writable, type Readable } from 'svelte/store';

export type RecorderState =
  | 'idle'
  | 'requesting'
  | 'recording'
  | 'processing'
  | 'error';

export type RecorderErrorCode =
  | 'permission-denied'
  | 'no-microphone'
  | 'recording-failed'
  | 'audio-too-short'
  | 'not-supported';

export interface RecordedClip {
  blob: Blob;
  /** Wall-clock duration in milliseconds. */
  duration: number;
  /** MIME type reported by the MediaRecorder (e.g. audio/webm). */
  mimeType: string;
}

export interface VoiceRecorder extends Readable<RecorderState> {
  /** Begin recording. Resolves once the first chunk has been captured. */
  record(): Promise<void>;
  /** Stop recording. Resolves with the captured clip, or rejects on error. */
  stop(): Promise<RecordedClip>;
  /** Abort the current take and tear everything down without producing a clip. */
  cancel(): void;
  /** Move from 'processing' back to 'idle' after the clip has been consumed. */
  reset(): void;
  /** Latest error code if state === 'error', otherwise null. */
  getError(): RecorderErrorCode | null;
}

const MIN_DURATION_MS = 350;

class RecorderError extends Error {
  public code: RecorderErrorCode;
  constructor(code: RecorderErrorCode) {
    super(code);
    this.code = code;
    this.name = 'RecorderError';
  }
}

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  // Prefer opus-in-webm (Android Chrome, modern WebViews). Fall back to
  // whatever the platform default is so we still get a usable blob.
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      // some webviews throw on isTypeSupported for unknown codecs
    }
  }
  return '';
}

export function createVoiceRecorder(): VoiceRecorder {
  let state: RecorderState = 'idle';
  let error: RecorderErrorCode | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: Blob[] = [];
  let startedAt = 0;
  let pendingStop: {
    resolve: (clip: RecordedClip) => void;
    reject: (err: Error) => void;
  } | null = null;

  const store = writable<RecorderState>(state);

  function setState(next: RecorderState, nextError: RecorderErrorCode | null = null): void {
    state = next;
    error = nextError;
    store.set(state);
  }

  async function ensureStream(): Promise<MediaStream> {
    if (stream) return stream;
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      throw new RecorderError('not-supported');
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream = s;
      return s;
    } catch (e) {
      const name = (e as DOMException | Error)?.name ?? '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        throw new RecorderError('permission-denied');
      }
      if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        throw new RecorderError('no-microphone');
      }
      throw new RecorderError('recording-failed');
    }
  }

  async function record(): Promise<void> {
    if (state === 'recording' || state === 'requesting') return;
    setState('requesting');
    try {
      const s = await ensureStream();
      const mimeType = pickMimeType();
      const opts: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const rec = mimeType ? new MediaRecorder(s, opts) : new MediaRecorder(s);
      mediaRecorder = rec;
      chunks = [];
      rec.ondataavailable = (ev: BlobEvent) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };
      rec.onerror = () => {
        const pend = pendingStop;
        pendingStop = null;
        setState('error', 'recording-failed');
        pend?.reject(new RecorderError('recording-failed'));
      };
      rec.onstop = () => {
        const pend = pendingStop;
        pendingStop = null;
        const duration = Date.now() - startedAt;
        if (duration < MIN_DURATION_MS) {
          setState('error', 'audio-too-short');
          pend?.reject(new RecorderError('audio-too-short'));
          return;
        }
        const blob = new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' });
        const clip: RecordedClip = {
          blob,
          duration,
          mimeType: rec.mimeType || mimeType || 'audio/webm',
        };
        setState('processing');
        // processing is synchronous for now (no Whisper in R172). A
        // future R-round can move this off-thread by deferring
        // resolve() until the transcription promise settles.
        pend?.resolve(clip);
        // Caller is expected to call reset() once it has consumed the
        // clip, which brings the state back to 'idle'.
      };

      rec.start();
      startedAt = Date.now();
      setState('recording');
    } catch (e) {
      if (e instanceof RecorderError) {
        setState('error', e.code);
      } else {
        setState('error', 'recording-failed');
      }
      throw e;
    }
  }

  function stop(): Promise<RecordedClip> {
    return new Promise<RecordedClip>((resolve, reject) => {
      if (state !== 'recording' || !mediaRecorder) {
        reject(new RecorderError('recording-failed'));
        return;
      }
      pendingStop = { resolve, reject };
      try {
        mediaRecorder.stop();
      } catch (e) {
        pendingStop = null;
        setState('error', 'recording-failed');
        reject(e instanceof Error ? e : new RecorderError('recording-failed'));
      }
    });
  }

  function cancel(): void {
    const pend = pendingStop;
    pendingStop = null;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.stop();
      } catch {
        // already stopped
      }
    }
    if (stream) {
      for (const t of stream.getTracks()) t.stop();
      stream = null;
    }
    mediaRecorder = null;
    chunks = [];
    setState('idle', null);
    pend?.reject(new RecorderError('recording-failed'));
  }

  /** Move from 'processing' back to 'idle' after the clip has been consumed. */
  function reset(): void {
    if (state === 'processing' || state === 'error') {
      setState('idle', null);
    }
  }

  function getError(): RecorderErrorCode | null {
    return error;
  }

  return {
    subscribe: store.subscribe,
    record,
    stop,
    cancel,
    reset,
    getError,
  };
}
