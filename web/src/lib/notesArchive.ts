// SPDX-License-Identifier: Apache-2.0
/**
 * Note archive — pure functions, no store dependency.
 *
 * Archive is "soft delete": a note stays in the data set but is hidden from
 * the main list. The user can restore from the archive view, or empty the
 * archive for a permanent delete. Reversible by design — the previous
 * hard-delete UX (R121) was destructive and unrecoverable.
 *
 * `archivedAt` is `null` for active notes and a number (epoch ms) for
 * archived ones. The Note interface is the source of truth in
 * `./notesBacklinks.ts` — see the `archivedAt?` field there.
 *
 * All functions here are pure: no I/O, no clock dependency (the `now`
 * parameter is optional, defaults to `Date.now()` only at the call site
 * boundary inside `notesStore`).
 */
import type { Note } from './notesBacklinks';

/** True if the note has a non-null `archivedAt` timestamp. */
export function isArchived(note: Note): boolean {
  return note.archivedAt !== null && note.archivedAt !== undefined;
}

/**
 * Return a new note with `archivedAt` set to `now` (default: `Date.now()`).
 * The input is NOT mutated. Idempotent: archiving an already-archived note
 * does NOT update the timestamp — use `isNoteArchiveable` first if you want
 * to refresh.
 */
export function archiveNote(note: Note, now?: number): Note {
  if (isArchived(note)) return note;
  return { ...note, archivedAt: now ?? Date.now() };
}

/**
 * Return a new note with `archivedAt` set to `null` (active again).
 * The input is NOT mutated. No-op if the note is already active.
 */
export function restoreNote(note: Note): Note {
  if (!isArchived(note)) return note;
  return { ...note, archivedAt: null };
}

/**
 * Filter and sort archived notes, most recently archived first.
 * Defensive: tolerates `undefined`/`null` input.
 */
export function getArchivedNotes(notes: Note[]): Note[] {
  if (!notes) return [];
  return [...notes]
    .filter(isArchived)
    .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));
}

/**
 * Filter to active (non-archived) notes. Sort order is the caller's job —
 * this is the "set difference" of "all notes minus archived".
 */
export function getActiveNotes(notes: Note[]): Note[] {
  if (!notes) return [];
  return notes.filter((n) => !isArchived(n));
}

/**
 * Return the input minus the archived notes — used to implement
 * "Empty archive" (permanent delete of every archived note).
 * The order of remaining notes is preserved.
 */
export function emptyArchive(notes: Note[]): Note[] {
  if (!notes) return [];
  return notes.filter((n) => !isArchived(n));
}

/**
 * Defensive: can the note still be archived? Returns false for notes that
 * are already archived. Use this in UI to disable the Archive button.
 */
export function isNoteArchiveable(note: Note): boolean {
  return !isArchived(note);
}
