// SPDX-License-Identifier: Apache-2.0
/**
 * Notes sort — pure helpers, no store dependency.
 *
 * R187 — pin/favorite. Pinned notes float to the top of the list so the
 * user can mark "important" notes without renumbering or starring inside
 * the title. The order is:
 *
 *   1. Pinned notes first, sorted by `pinnedAt` desc (most recently
 *      pinned wins).
 *   2. Then unpinned notes, sorted by `updatedAt` desc (most recently
 *      edited wins).
 *   3. Ties broken by `createdAt` desc.
 *
 * Missing or invalid fields fall back gracefully so old data (where
 * `pinnedAt` was absent) and corrupted timestamps (e.g. an unparseable
 * ISO string from a bad backup) don't crash the list. The function is
 * pure: it never mutates the input array or the notes inside it.
 */
import type { Note } from './notesBacklinks';

/**
 * Resolve the effective `pinnedAt` for a note. Returns `null` (= not
 * pinned) if the field is missing, null, empty, or an unparseable
 * string. A valid ISO timestamp is converted to ms-since-epoch.
 */
function effectivePinnedAt(n: Note): number | null {
  if (!n.pinnedAt) return null;
  const t = Date.parse(n.pinnedAt);
  if (Number.isNaN(t)) return null;
  return t;
}

/** `updatedAt` may be missing on old notes; fall back to createdAt, then 0. */
function effectiveUpdatedAt(n: Note): number {
  return n.updatedAt ?? n.createdAt ?? 0;
}

/** `createdAt` may be missing; treat as 0 (the oldest possible timestamp). */
function effectiveCreatedAt(n: Note): number {
  return n.createdAt ?? 0;
}

/**
 * Sort notes for the list view. Returns a NEW array — input is never
 * mutated. The same `Note` references are preserved, so React-style
 * "is this the same object?" checks downstream keep working.
 */
export function sortNotes(notes: Note[]): Note[] {
  const out = [...notes];
  out.sort((a, b) => {
    const aPin = effectivePinnedAt(a);
    const bPin = effectivePinnedAt(b);

    // Pinned partition: pinned notes sort before unpinned notes.
    if (aPin !== null && bPin !== null) {
      // Both pinned: most recently pinned first.
      if (aPin !== bPin) return bPin - aPin;
      // Same pinnedAt: fall through to updatedAt/createdAt tie-breaks.
    } else if (aPin !== null && bPin === null) {
      return -1;
    } else if (aPin === null && bPin !== null) {
      return 1;
    }

    // Both unpinned (or same pinnedAt): updatedAt desc.
    const aUpd = effectiveUpdatedAt(a);
    const bUpd = effectiveUpdatedAt(b);
    if (aUpd !== bUpd) return bUpd - aUpd;

    // Tie on updatedAt: createdAt desc. Older creation dates rank lower.
    return effectiveCreatedAt(b) - effectiveCreatedAt(a);
  });
  return out;
}
