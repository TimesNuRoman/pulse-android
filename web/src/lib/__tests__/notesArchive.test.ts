// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import {
  isArchived,
  archiveNote,
  restoreNote,
  getArchivedNotes,
  getActiveNotes,
  emptyArchive,
  isNoteArchiveable,
} from '../notesArchive';
import type { Note } from '../notesBacklinks';

function mkNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    title: 'Sample',
    content: 'Body',
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

describe('isArchived', () => {
  it('returns false for null archivedAt', () => {
    expect(isArchived(mkNote({ archivedAt: null }))).toBe(false);
  });
  it('returns false for undefined archivedAt', () => {
    expect(isArchived(mkNote({}))).toBe(false);
    expect(isArchived(mkNote({ archivedAt: undefined }))).toBe(false);
  });
  it('returns true for a timestamp', () => {
    expect(isArchived(mkNote({ archivedAt: 12345 }))).toBe(true);
  });
  it('returns true for 0 (falsy but valid timestamp — per R202 contract)', () => {
    // Per R202 brief: `isArchived` is true iff `archivedAt !== null && !== undefined`.
    // 0 is a non-null number, so it IS archived. `null` is the canonical
    // "not archived" marker; the timestamp itself can be any number.
    expect(isArchived(mkNote({ archivedAt: 0 }))).toBe(true);
  });
});

describe('archiveNote', () => {
  it('sets archivedAt to now (default), does not mutate original', () => {
    const before = mkNote({ title: 'Before' });
    const after = archiveNote(before);
    expect(after.title).toBe('Before');
    expect(after.archivedAt).toBeTypeOf('number');
    expect(before.archivedAt).toBeUndefined();
  });
  it('uses explicit now when provided', () => {
    const before = mkNote();
    const after = archiveNote(before, 9999);
    expect(after.archivedAt).toBe(9999);
  });
  it('is idempotent (no-op on already-archived)', () => {
    const before = mkNote({ archivedAt: 100 });
    const after = archiveNote(before, 200);
    expect(after).toBe(before);
    expect(after.archivedAt).toBe(100);
  });
  it('preserves Cyrillic content', () => {
    const before = mkNote({ title: 'Привет', content: 'Привет мир #здесь' });
    const after = archiveNote(before, 5000);
    expect(after.title).toBe('Привет');
    expect(after.content).toBe('Привет мир #здесь');
    expect(after.archivedAt).toBe(5000);
  });
});

describe('restoreNote', () => {
  it('sets archivedAt to null, does not mutate original', () => {
    const before = mkNote({ archivedAt: 1234 });
    const after = restoreNote(before);
    expect(after.archivedAt).toBeNull();
    expect(before.archivedAt).toBe(1234);
  });
  it('is no-op on already-active note', () => {
    const before = mkNote({ archivedAt: null });
    const after = restoreNote(before);
    expect(after).toBe(before);
  });
});

describe('getArchivedNotes / getActiveNotes', () => {
  it('getArchivedNotes filters + sorts desc', () => {
    const notes: Note[] = [
      mkNote({ id: 'a', archivedAt: 100 }),
      mkNote({ id: 'b', archivedAt: 300 }),
      mkNote({ id: 'c', archivedAt: 200 }),
      mkNote({ id: 'd' }),
    ];
    const result = getArchivedNotes(notes);
    expect(result.map((n) => n.id)).toEqual(['b', 'c', 'a']);
  });
  it('getActiveNotes excludes archived', () => {
    const notes: Note[] = [
      mkNote({ id: 'a' }),
      mkNote({ id: 'b', archivedAt: 100 }),
      mkNote({ id: 'c', archivedAt: null }),
    ];
    const result = getActiveNotes(notes);
    expect(result.map((n) => n.id)).toEqual(['a', 'c']);
  });
  it('handles empty array', () => {
    expect(getArchivedNotes([])).toEqual([]);
    expect(getActiveNotes([])).toEqual([]);
  });
  it('handles 100 archived notes without perf issue', () => {
    const notes: Note[] = Array.from({ length: 100 }, (_, i) =>
      mkNote({ id: `n${i}`, archivedAt: i * 1000 }),
    );
    const result = getArchivedNotes(notes);
    expect(result.length).toBe(100);
    expect(result[0].archivedAt).toBe(99000); // most recent first
    expect(result[99].archivedAt).toBe(0);
  });
  it('tolerates undefined input (defensive)', () => {
    // @ts-expect-error — testing runtime defensive check
    expect(getArchivedNotes(undefined)).toEqual([]);
    // @ts-expect-error
    expect(getActiveNotes(undefined)).toEqual([]);
  });
});

describe('emptyArchive', () => {
  it('returns notes without archived', () => {
    const notes: Note[] = [
      mkNote({ id: 'a' }),
      mkNote({ id: 'b', archivedAt: 100 }),
      mkNote({ id: 'c' }),
    ];
    const result = emptyArchive(notes);
    expect(result.map((n) => n.id)).toEqual(['a', 'c']);
  });
  it('preserves order of remaining', () => {
    const notes: Note[] = [
      mkNote({ id: 'a' }),
      mkNote({ id: 'b', archivedAt: 200 }),
      mkNote({ id: 'c' }),
      mkNote({ id: 'd', archivedAt: 100 }),
    ];
    const result = emptyArchive(notes);
    expect(result.map((n) => n.id)).toEqual(['a', 'c']);
  });
});

describe('isNoteArchiveable', () => {
  it('true for non-archived', () => {
    expect(isNoteArchiveable(mkNote())).toBe(true);
    expect(isNoteArchiveable(mkNote({ archivedAt: null }))).toBe(true);
  });
  it('false for archived', () => {
    expect(isNoteArchiveable(mkNote({ archivedAt: 100 }))).toBe(false);
  });
});
