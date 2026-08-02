// SPDX-License-Identifier: Apache-2.0
/**
 * SpeechRecognition wrapper.
 *
 * Thin adapter around the @capacitor-community/speech-recognition plugin,
 * which is exposed at runtime via window.Capacitor.Plugins.SpeechRecognition.
 *
 * On Android, the plugin is registered in capacitor.plugins.json with classpath
 * com.getcapacitor.community.speechrecognition.SpeechRecognition. RECORD_AUDIO
 * permission is already declared in AndroidManifest.xml.
 *
 * On the web (or when the plugin is missing) all calls become no-ops and
 * isAvailable() returns false, so the mic button in NoteToolbar degrades
 * gracefully.
 */

export interface RecognitionResult {
  text: string;
  isFinal: boolean;
}

export type RecognitionCallback = (result: RecognitionResult) => void;
export type RecognitionError = (err: string) => void;

interface SpeechRecognitionPlugin {
  available: () => Promise<{ available: boolean }>;
  start: (options: {
    language?: string;
    maxResults?: number;
    partialResults?: boolean;
    popup?: boolean;
  }) => Promise<void>;
  stop: () => Promise<void>;
  addListener: (
    eventName: 'partialResults',
    listener: (data: { matches: string[] }) => void,
  ) => PluginListenerHandle;
}

interface PluginListenerHandle {
  remove: () => Promise<void>;
}

declare global {
  interface Window {
    Capacitor?: {
      Plugins: {
        SpeechRecognition?: SpeechRecognitionPlugin;
      };
    };
  }
}

const LANG = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';

// Track the most recent partial-results listener so stop() can detach it.
// Without this, every mic-toggle cycle would register a new listener and
// leak the previous one (each leaked listener keeps a closure over the
// previous onResult callback — small heap cost, but unbounded growth).
let partialListener: PluginListenerHandle | null = null;

function getPlugin(): SpeechRecognitionPlugin | null {
  if (typeof window === 'undefined') return null;
  return window.Capacitor?.Plugins?.SpeechRecognition ?? null;
}

export async function isAvailable(): Promise<boolean> {
  const plugin = getPlugin();
  if (!plugin) return false;
  try {
    const r = await plugin.available();
    return r.available === true;
  } catch {
    return false;
  }
}

export async function start(
  onResult: RecognitionCallback,
  onError: RecognitionError,
): Promise<void> {
  const plugin = getPlugin();
  if (!plugin) {
    onError('SpeechRecognition plugin not available');
    return;
  }
  try {
    // Idempotent: if a previous start() left a listener attached (e.g. the
    // caller forgot to stop(), or stop() was racy), remove it before
    // registering a new one. This is the leak fix — without it, N start
    // cycles leave N listeners firing into the most recent onResult.
    if (partialListener) {
      try {
        await partialListener.remove();
      } catch {
        // previous handle is already gone (native side torn down) — safe to ignore
      }
      partialListener = null;
    }
    partialListener = plugin.addListener('partialResults', (data: { matches: string[] }) => {
      const text = data?.matches?.[0];
      if (text) onResult({ text, isFinal: false });
    });
    await plugin.start({
      language: LANG,
      maxResults: 1,
      partialResults: true,
      popup: false,
    });
  } catch (e) {
    onError(String(e));
  }
}

export async function stop(): Promise<void> {
  try {
    const plugin = getPlugin();
    await plugin?.stop();
  } catch {
    // user-initiated stop can race with native teardown; swallow
  }
  // Detach the listener we attached in start(). Doing this after plugin.stop()
  // avoids the "remove() called before stop() settled" race on Android.
  if (partialListener) {
    try {
      await partialListener.remove();
    } catch {
      // native side may have already detached; safe to ignore
    }
    partialListener = null;
  }
}
