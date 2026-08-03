// SPDX-License-Identifier: Apache-2.0
/**
 * Per-note export — pure serialisation, no DOM, no Capacitor.
 *
 * Complements the bulk backup format shipped in `backupRestore.ts` (R152).
 * R152 wraps `Note[]` for "export all / import all". R185 wraps a single
 * `Note` for the "share this one note" path: Export button in the note
 * toolbar, two format choices (JSON, Markdown).
 *
 * Single-note JSON shape (version 1) is intentionally compatible with
 * the R152 bulk format at the envelope level (same `version`,
 * `exportedAt`, `appVersion` fields). The only structural difference is
 * that the payload key is `note` (singular) instead of `notes` (array).
 * A future "export N specific notes" feature can wrap a list under the
 * `notes` key without bumping the version.
 *
 * Markdown format uses YAML frontmatter so the file is importable by
 * Obsidian, Joplin, Foam, and other static-site generators. Frontmatter
 * keys mirror the JSON envelope (id, title, tags, createdAt, updatedAt).
 * Body follows verbatim, with a `# {title}` H1 header for readability.
 *
 * The `Note` field used in the brief is `body`; the actual store type
 * (see `notesBacklinks.ts`) is `content`. This module uses `content`.
 */
import type { Note } from './notesBacklinks';

/** Current single-note export format version. Bump when the schema changes. */
export const NOTE_EXPORT_VERSION = 1 as const;

/** Supported export formats. */
export type ExportFormat = 'json' | 'md';

/** Maximum slug length in the suggested filename. */
const SLUG_MAX = 40;

/** Fallback slug length when derived from the note id. */
const ID_FALLBACK_MAX = 8;

/** ISO date in YYYY-MM-DD form (UTC). */
export function todayDateStamp(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Read the build-time app version from Vite env, with a sensible
 * fallback for tests and non-Vite contexts. Matches the helper used by
 * the update-checker (R88).
 */
export function getAppVersion(): string {
  try {
    const env = (import.meta as { env?: Record<string, unknown> }).env;
    const v = env?.['VITE_APP_VERSION'];
    if (typeof v === 'string' && v.length > 0) return v;
  } catch {
    // import.meta.env is not available (e.g. plain node)
  }
  return '0.0.0';
}

/**
 * Convert a note to a URL-safe slug for the suggested filename.
 *
 *   "Hello, World!"  -> "hello-world"
 *   "  Multi   line  " -> "multi-line"
 *   "  "             -> ""   (empty; caller falls back to body)
 *   "日本語"          -> ""   (empty; non-ASCII; caller falls back)
 *
 * Slug is lowercased, with non-[a-z0-9] runs collapsed to a single
 * dash, leading and trailing dashes stripped, capped at 40 chars.
 */
export function slugifyTitle(title: string): string {
  if (!title) return '';
  const lowered = title.toLowerCase();
  // Replace every run of non-alphanumerics with a single dash.
  const dashed = lowered.replace(/[^a-z0-9]+/g, '-');
  // Strip leading/trailing dashes.
  const trimmed = dashed.replace(/^-+|-+$/g, '');
  if (trimmed.length <= SLUG_MAX) return trimmed;
  return trimmed.slice(0, SLUG_MAX).replace(/-+$/g, '');
}

/**
 * Derive a slug for the suggested filename. Falls back through:
 *   1. The note title (slugified, 40 chars max)
 *   2. The first 40 characters of the body, slugified
 *   3. The first 8 characters of the note id
 *
 * The fallback chain is deterministic and tested — never returns an
 * empty string. If the body is whitespace-only it still contributes the
 * first 40 chars, which slugify reduces to "". The id fallback catches
 * that.
 */
export function deriveFilenameSlug(note: Note): string {
  const fromTitle = slugifyTitle(note.title);
  if (fromTitle.length > 0) return fromTitle;
  const fromBody = slugifyTitle((note.content ?? '').slice(0, SLUG_MAX));
  if (fromBody.length > 0) return fromBody;
  return (note.id ?? '').slice(0, ID_FALLBACK_MAX);
}

/**
 * Build the suggested filename: `pulse-note-{YYYY-MM-DD}-{slug}.{ext}`.
 *
 *   "My note!"  -> "pulse-note-2026-08-03-my-note.md"
 *   ""          -> "pulse-note-2026-08-03-{bodySlug}.json"
 *   title="" body="" -> "pulse-note-2026-08-03-{id8}.json"
 */
export function buildNoteFilename(
  note: Note,
  format: ExportFormat,
  options?: { date?: Date },
): string {
  const now = options?.date ?? new Date();
  const slug = deriveFilenameSlug(note);
  return `pulse-note-${todayDateStamp(now)}-${slug}.${format}`;
}

/**
 * Serialise a note as pretty-printed JSON.
 *
 * Output shape (version 1):
 *   {
 *     "version": 1,
 *     "exportedAt": "2026-08-03T12:34:56.789Z",
 *     "appVersion": "0.6.7",
 *     "note": { id, title, content, createdAt, updatedAt, tags? }
 *   }
 *
 * The `note` object is a shallow copy with `tags` deep-copied when
 * present, so consumers may mutate the result without aliasing the
 * store.
 */
export function exportNoteAsJson(note: Note, options?: { appVersion?: string; now?: Date }): string {
  const now = options?.now ?? new Date();
  const appVersion = options?.appVersion ?? getAppVersion();
  const payload = {
    version: NOTE_EXPORT_VERSION,
    exportedAt: now.toISOString(),
    appVersion,
    note: {
      id: note.id,
      title: note.title,
      content: note.content,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      ...(Array.isArray(note.tags) ? { tags: [...note.tags] } : {}),
    },
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Serialise a note as Markdown with YAML frontmatter.
 *
 * Shape:
 *   ---
 *   id: abc123
 *   title: My note
 *   tags: [tag1, tag2]
 *   createdAt: 2026-08-01T10:00:00.000Z
 *   updatedAt: 2026-08-03T12:34:00.000Z
 *   ---
 *
 *   # My note
 *
 *   Body content here, preserved verbatim.
 *
 * Notes on the rendering:
 *   - Frontmatter `title` is YAML-escaped (quotes if it contains
 *     characters that would break the YAML scanner: `:`, `#`, leading
 *     spaces, leading `-`, etc.).
 *   - `tags` is omitted from the frontmatter when the note has none.
 *   - The H1 header is always present, even when the title is empty
 *     (renders as `# ` followed by the body). This keeps the file
 *     readable in every Markdown viewer.
 *   - The body is appended verbatim. The exporter does NOT touch
 *     wikilinks, code fences, or `#tag` markers.
 */
export function exportNoteAsMarkdown(note: Note): string {
  const lines: string[] = ['---'];
  lines.push(`id: ${note.id}`);
  lines.push(`title: ${yamlString(note.title)}`);
  if (Array.isArray(note.tags) && note.tags.length > 0) {
    lines.push(`tags: [${note.tags.map(yamlBareString).join(', ')}]`);
  }
  lines.push(`createdAt: ${epochToIso(note.createdAt)}`);
  lines.push(`updatedAt: ${epochToIso(note.updatedAt)}`);
  lines.push('---');
  lines.push('');
  lines.push(`# ${note.title}`);
  lines.push('');
  if (note.content && note.content.length > 0) {
    lines.push(note.content);
    if (!note.content.endsWith('\n')) lines.push('');
  }
  return lines.join('\n');
}

/**
 * Parse an export back into a single note. Returns `null` if the input
 * is not a valid v1 single-note JSON envelope. Useful for a future
 * "Import single note" feature — the importer can short-circuit when
 * it sees a `note` (singular) key vs the bulk `notes` (array) key.
 */
export function parseNoteExport(json: string): Note | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  if (obj.version !== NOTE_EXPORT_VERSION) return null;
  const n = obj['note'];
  if (!n || typeof n !== 'object') return null;
  const note = n as Record<string, unknown>;
  if (typeof note['id'] !== 'string' || note['id'].length === 0) return null;
  if (typeof note['title'] !== 'string') return null;
  if (typeof note['content'] !== 'string') return null;
  if (typeof note['createdAt'] !== 'number' || !Number.isFinite(note['createdAt'])) return null;
  if (typeof note['updatedAt'] !== 'number' || !Number.isFinite(note['updatedAt'])) return null;
  const tagsRaw = note['tags'];
  if (tagsRaw !== undefined) {
    if (!Array.isArray(tagsRaw) || !tagsRaw.every((t) => typeof t === 'string')) return null;
  }
  return {
    id: note['id'] as string,
    title: note['title'] as string,
    content: note['content'] as string,
    createdAt: note['createdAt'] as number,
    updatedAt: note['updatedAt'] as number,
    ...(Array.isArray(tagsRaw) ? { tags: tagsRaw as string[] } : {}),
  };
}

// --- internal helpers -------------------------------------------------------

function epochToIso(epoch: number): string {
  if (!Number.isFinite(epoch)) return new Date(0).toISOString();
  return new Date(epoch).toISOString();
}

/**
 * YAML-quote a string when it contains characters that would break the
 * YAML scanner (`:`, `#`, leading whitespace, leading `-`, etc.). Always
 * uses double-quotes and escapes embedded backslashes and double-quotes
 * — the safe direction.
 */
function yamlString(value: string): string {
  if (value.length === 0) return '""';
  // Characters that force quoting: ":", "#", leading "-", leading "?",
  // leading "*", leading "&", leading "!", leading "|", leading ">",
  // leading "'", leading '"', leading "%", leading "@", leading "`",
  // control chars, and YAML reserved tokens (true/false/null/~/yes/no).
  const needsQuotes = /[:#\n\r\t\\\[\]{}]/.test(value) ||
    /^\s/.test(value) ||
    /^[-?*&|>'"%@`]/.test(value) ||
    /^(true|false|null|~|yes|no|on|off)$/i.test(value);
  if (!needsQuotes) return value;
  return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

/**
 * Bare YAML scalar (used inside a flow-style `[a, b, c]` list). Keeps
 * the list one-line for readability. Quotes each element if it contains
 * a comma, bracket, or quote.
 */
function yamlBareString(value: string): string {
  if (value.length === 0) return '""';
  if (/[,"'\[\]{}\n\r]/.test(value)) {
    return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }
  return value;
}
