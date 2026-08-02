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
  addListener: (eventName: 'partialResults', listener: (data: { matches: string[] }) => void) => void;
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
    plugin.addListener('partialResults', (data: { matches: string[] }) => {
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
}
