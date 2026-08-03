/**
 * Backup / restore — pure serialization, merge, and replace logic for notes.
 *
 * Pure module. No DOM, no Capacitor. The file-system layer (see
 * backupFileSystem.ts) and the UI layer (SettingsView) consume these
 * primitives.
 *
 * On-disk format (version 1):
 *   {
 *     "version": 1,
 *     "exportedAt": "2026-08-03T12:34:56.000Z",
 *     "appVersion": "0.6.7",
 *     "notes": Note[]
 *   }
 *
 * Merge rule: for notes with the same `id`, keep the entry with the higher
 * `updatedAt` (epoch ms). Notes present on only one side are kept as-is.
 *
 * Replace rule: drop all existing notes; the imported list is the new
 * canonical set. Existing-only notes are discarded.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Note } from './notesBacklinks';

/** Current backup format version. Bump when the schema changes. */
export const BACKUP_VERSION = 1 as const;

/** Backed-up note shape (subset of Note, identical today). */
export interface BackupNote {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  tags?: string[];
}

export interface BackupFile {
  version: number;
  exportedAt: string;
  appVersion: string;
  notes: BackupNote[];
}

export interface ExportResult {
  json: string;
  filename: string;
}

/** ISO date in YYYY-MM-DD form (UTC). Used in the suggested filename. */
export function todayDateStamp(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Build the suggested filename for a backup: pulse-notes-backup-YYYY-MM-DD.json
 */
export function buildBackupFilename(now: Date = new Date()): string {
  return `pulse-notes-backup-${todayDateStamp(now)}.json`;
}

/**
 * Serialise notes into a JSON string. Returns the string and a suggested
 * filename. `appVersion` is the caller's current app version (from
 * $lib/update-checker or similar).
 */
export function exportAllNotes(notes: Note[], appVersion: string, now: Date = new Date()): ExportResult {
  const payload: BackupFile = {
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    appVersion,
    // Defensive shallow copy; consumers should not rely on aliasing.
    notes: notes.map((n) => ({
      id: n.id,
      title: n.title,
      content: n.content,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      ...(Array.isArray(n.tags) ? { tags: [...n.tags] } : {}),
    })),
  };
  return {
    json: JSON.stringify(payload, null, 2),
    filename: buildBackupFilename(now),
  };
}

/**
 * Parse a JSON string into a backup payload. Throws on:
 *  - invalid JSON
 *  - schema mismatch (handled by validateBackupFormat)
 */
export function parseBackupFile(json: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON: ${msg}`);
  }
  if (!validateBackupFormat(parsed)) {
    throw new Error('Backup file is not a valid Pulse notes backup');
  }
  return parsed;
}

/**
 * Schema check. Accepts only well-formed version-1 payloads.
 *  - version must be a number === BACKUP_VERSION
 *  - exportedAt must be an ISO 8601 string
 *  - appVersion must be a non-empty string
 *  - notes must be an array of valid note objects
 */
export function validateBackupFormat(parsed: unknown): parsed is BackupFile {
  if (!parsed || typeof parsed !== 'object') return false;
  const obj = parsed as Record<string, unknown>;
  if (obj.version !== BACKUP_VERSION) return false;
  if (typeof obj.exportedAt !== 'string' || obj.exportedAt.length === 0) return false;
  // Loose ISO 8601 sanity check (Date.parse will accept other formats).
  if (Number.isNaN(Date.parse(obj.exportedAt))) return false;
  if (typeof obj.appVersion !== 'string' || obj.appVersion.length === 0) return false;
  if (!Array.isArray(obj.notes)) return false;
  for (const n of obj.notes) {
    if (!isValidBackupNote(n)) return false;
  }
  return true;
}

function isValidBackupNote(value: unknown): value is BackupNote {
  if (!value || typeof value !== 'object') return false;
  const n = value as Record<string, unknown>;
  if (typeof n.id !== 'string' || n.id.length === 0) return false;
  if (typeof n.title !== 'string') return false;
  if (typeof n.content !== 'string') return false;
  if (typeof n.createdAt !== 'number' || !Number.isFinite(n.createdAt)) return false;
  if (typeof n.updatedAt !== 'number' || !Number.isFinite(n.updatedAt)) return false;
  if (n.tags !== undefined && !Array.isArray(n.tags)) return false;
  if (Array.isArray(n.tags) && !n.tags.every((t) => typeof t === 'string')) return false;
  return true;
}

/**
 * Merge imported notes into the existing set.
 *  - For ids present on both sides, keep the entry with the higher
 *    `updatedAt` (epoch ms). Ties keep the imported entry.
 *  - For ids present on only one side, keep that side.
 *  - The returned list is the new canonical note set.
 */
export function mergeNotes(existing: Note[], imported: BackupNote[]): Note[] {
  const byId = new Map<string, Note>();
  for (const n of existing) byId.set(n.id, n);
  for (const imp of imported) {
    const cur = byId.get(imp.id);
    if (!cur || imp.updatedAt >= cur.updatedAt) {
      byId.set(imp.id, { ...imp });
    }
  }
  return Array.from(byId.values());
}

/**
 * Replace the existing set with the imported one. Existing-only notes are
 * discarded. Returns a fresh array (no aliasing of the input).
 */
export function replaceNotes(_existing: Note[], imported: BackupNote[]): Note[] {
  return imported.map((n) => ({ ...n }));
}

/**
 * Pure helper: count how many notes would be added / updated / kept as-is
 * when applying `mergeNotes(existing, imported)`. Useful for the
 * "Importing ... X of N" progress UI and for the pre-import summary.
 */
export interface MergeDiff {
  added: number;
  updated: number;
  unchanged: number;
}

export function previewMerge(existing: Note[], imported: BackupNote[]): MergeDiff {
  const existingById = new Map<string, Note>();
  for (const n of existing) existingById.set(n.id, n);
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const imp of imported) {
    const cur = existingById.get(imp.id);
    if (!cur) {
      added += 1;
    } else if (imp.updatedAt > cur.updatedAt) {
      updated += 1;
    } else {
      unchanged += 1;
    }
  }
  return { added, updated, unchanged };
}
