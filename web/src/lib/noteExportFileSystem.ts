// SPDX-License-Identifier: Apache-2.0
/**
 * Per-note export — file-system adapter.
 *
 * Mirrors `backupFileSystem.ts` (R152). Three-tier fallback for
 * delivering a single-note file to the user:
 *
 *   1. **Capacitor Share** (Android native): if `@capacitor/share` is
 *      available at runtime via `window.Capacitor.Plugins.Share`, the
 *      note text is routed through the native share sheet. The user
 *      picks where the file goes (Drive, Files, email, etc.). Best UX
 *      on Android, and the only path that integrates with the OS-level
 *      share intent.
 *   2. **Web anchor + blob download** (browser + Android WebView): a
 *      `Blob` is built from the exported content, a hidden `<a
 *      download>` is clicked, and the URL is revoked. The Android
 *      WebView routes this through the system `DownloadManager` and
 *      the file lands in `Downloads/`.
 *   3. **Noop**: when neither path is available (e.g. SSR, headless
 *      test), the helper returns `transport: 'noop'` so the UI can
 *      surface a graceful "couldn't save" message instead of hanging.
 *
 * Reuses the R152 envelope format (via `exportNoteAsJson` /
 * `exportNoteAsMarkdown`) and the `buildNoteFilename` naming pattern
 * (`pulse-note-{date}-{slug}.{ext}`).
 *
 * Note on the Share API: the `files` field of `@capacitor/share` is
 * available, but in this dynamic-access path we pass the content as
 * `text` (same approach as R152's `backupFileSystem.ts`). This avoids
 * pulling `@capacitor/filesystem` or `WebFile` polyfills into the
 * bundle, and the user can still pick "Save to Files" from the
 * resulting share sheet.
 */

import type { Note } from './notesBacklinks';
import {
  buildNoteFilename,
  exportNoteAsJson,
  exportNoteAsMarkdown,
  type ExportFormat,
} from './noteExport';

export type SaveNoteTransport = 'native-share' | 'web-download' | 'noop';

export interface SaveNoteResult {
  /** Best-effort display path or target (e.g. "Downloads/pulse-note-….md"). */
  path?: string;
  filename: string;
  /** Which transport actually wrote the file. */
  transport: SaveNoteTransport;
}

/** MIME type for each format — used both for the Blob and the Share dialog. */
const MIME: Record<ExportFormat, string> = {
  json: 'application/json;charset=utf-8',
  md: 'text/markdown;charset=utf-8',
};

/** Dialog title shown in the native share sheet. */
const DIALOG_TITLE: Record<ExportFormat, string> = {
  json: 'Save note as JSON',
  md: 'Save note as Markdown',
};

interface SharePluginShape {
  share?: (o: {
    title?: string;
    text?: string;
    dialogTitle?: string;
  }) => Promise<unknown>;
}

function getSharePlugin(): SharePluginShape | null {
  if (typeof window === 'undefined') return null;
  const cap = window.Capacitor?.Plugins?.['Share'] as SharePluginShape | undefined;
  return cap ?? null;
}

export interface SaveNoteOptions {
  /** Override the suggested filename from `buildNoteFilename`. */
  fallbackFilename?: string;
  /** App version string. Defaults to `getAppVersion()` from `noteExport`. */
  appVersion?: string;
}

/**
 * Save a single note to the user's preferred destination.
 *
 * Returns the transport that actually fired and the filename the user
 * will see in their file manager or share sheet. The function never
 * rejects on user cancellation of the share sheet (returns
 * `transport: 'native-share'` with no `path`).
 */
export async function saveNoteFile(
  note: Note,
  format: ExportFormat,
  options?: SaveNoteOptions,
): Promise<SaveNoteResult> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      filename: options?.fallbackFilename ?? buildNoteFilename(note, format),
      transport: 'noop',
    };
  }

  const filename = options?.fallbackFilename ?? buildNoteFilename(note, format);
  const content = serializeNote(note, format, options?.appVersion);

  // 1) Native share path — lets the user pick Drive / Files / etc.
  const cap = getSharePlugin();
  if (cap?.share) {
    try {
      await cap.share({
        title: filename,
        text: content,
        dialogTitle: DIALOG_TITLE[format],
      });
      return { filename, transport: 'native-share' };
    } catch {
      // user cancelled or share failed — fall through to web download
    }
  }

  // 2) Web anchor + blob download. Works in plain browsers and in the
  //    Android WebView (system DownloadManager takes it from there).
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    triggerBrowserDownload(content, filename, format);
    return {
      path: `Downloads/${filename}`,
      filename,
      transport: 'web-download',
    };
  }

  // 3) Noop — neither share nor blob is available.
  return { filename, transport: 'noop' };
}

// --- internal helpers -------------------------------------------------------

function serializeNote(note: Note, format: ExportFormat, appVersion?: string): string {
  if (format === 'json') {
    return exportNoteAsJson(note, appVersion !== undefined ? { appVersion } : undefined);
  }
  return exportNoteAsMarkdown(note);
}

function triggerBrowserDownload(content: string, filename: string, format: ExportFormat): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const blob = new Blob([content], { type: MIME[format] });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}
