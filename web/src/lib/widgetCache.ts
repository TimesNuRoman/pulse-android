// SPDX-License-Identifier: Apache-2.0
/**
 * Widget cache writer.
 *
 * R173 — writes the 3 most-recently-updated notes to a JSON file that the
 * Android home screen AppWidgetProvider reads on onUpdate(). The web layer
 * owns the data; the native widget is a read-only consumer.
 *
 * Storage path: <Documents>/widget-cache.json
 *   - Documents is auto-backed-up and persistent on Android.
 *   - The Android side reads the same file via context.filesDir (Capacitor's
 *     Filesystem Directory.Documents maps to getFilesDir() on Android).
 *
 * Dynamic plugin access follows the existing capacitor.ts pattern — no static
 * @capacitor/filesystem import. If the plugin isn't installed at runtime
 * (web build, missing native plugin), this becomes a silent no-op so the
 * app still works in a browser.
 */

import type { Note } from './notesBacklinks';

export interface WidgetNote {
  id: string;
  title: string;
  preview: string;
}

const WIDGET_CACHE_FILE = 'widget-cache.json';
const PREVIEW_CHARS = 80;
const MAX_NOTES = 3;

interface FilesystemPlugin {
  writeFile?: (opts: {
    path: string;
    data: string;
    directory?: string;
    recursive?: boolean;
  }) => Promise<unknown>;
  readFile?: (opts: { path: string; directory?: string }) => Promise<{ data?: string }>;
}

function getFilesystemPlugin(): FilesystemPlugin | null {
  if (typeof window === 'undefined') return null;
  // capacitor.ts already types window.Capacitor, so we use the loosely-typed
  // unknown cast here to avoid redeclaring the global interface. The original
  // Capacitor type lives in capacitor.ts.
  const cap = window.Capacitor as unknown as
    | { Plugins?: Record<string, unknown> }
    | undefined;
  if (!cap) return null;
  const plugin = cap.Plugins?.['Filesystem'] as FilesystemPlugin | undefined;
  return plugin ?? null;
}

function previewFromContent(content: string): string {
  const flat = content.replace(/\s+/g, ' ').trim();
  if (flat.length <= PREVIEW_CHARS) return flat;
  return flat.slice(0, PREVIEW_CHARS);
}

function topRecent(notes: Note[], limit: number): Note[] {
  return [...notes]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}

/**
 * Build the widget payload (top 3, by updatedAt desc).
 * Exported for unit tests so we can assert shape without touching the
 * filesystem.
 */
export function buildWidgetPayload(notes: Note[]): WidgetNote[] {
  return topRecent(notes, MAX_NOTES).map((n) => ({
    id: n.id,
    title: n.title || 'Untitled',
    preview: previewFromContent(n.content ?? ''),
  }));
}

/**
 * Write the widget cache to disk. No-op on non-native platforms or when the
 * Filesystem plugin is unavailable (e.g. plain browser, missing native dep).
 * Errors are swallowed so a cache-write failure never breaks a note save.
 */
export async function writeWidgetCache(notes: Note[]): Promise<void> {
  const plugin = getFilesystemPlugin();
  if (!plugin?.writeFile) return;
  const payload = buildWidgetPayload(notes);
  try {
    await plugin.writeFile({
      path: WIDGET_CACHE_FILE,
      data: JSON.stringify(payload),
      directory: 'DOCUMENTS',
      recursive: false,
    });
  } catch {
    // Best-effort. Widget will just show stale or empty data on next refresh.
  }
}
