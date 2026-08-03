// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, beforeEach } from 'vitest';
import { notesStore } from '../notesStore';

describe('notesStore — archive (R202)', () => {
  beforeEach(() => {
    localStorage.clear();
    notesStore.resetToMocks();
  });

  it('archiveNote() updates the note with archivedAt and persists', () => {
    const n = notesStore.list()[0];
    const updated = notesStore.archiveNote(n.id, 12345);
    expect(updated).toBeDefined();
    expect(updated!.archivedAt).toBe(12345);
    expect(notesStore.get(n.id)!.archivedAt).toBe(12345);
    // Persisted to localStorage
    const raw = localStorage.getItem('pulse.notes.v1');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    const stored = parsed.find((x: { id: string }) => x.id === n.id);
    expect(stored.archivedAt).toBe(12345);
  });

  it('archiveNote() returns undefined for unknown id', () => {
    expect(notesStore.archiveNote('does-not-exist', 1)).toBeUndefined();
  });

  it('archiveNote() is idempotent (no timestamp update on re-archive)', () => {
    const n = notesStore.list()[0];
    notesStore.archiveNote(n.id, 100);
    const second = notesStore.archiveNote(n.id, 200);
    expect(second!.archivedAt).toBe(100);
  });

  it('restoreNote() clears archivedAt and returns to active state', () => {
    const n = notesStore.list()[0];
    notesStore.archiveNote(n.id, 500);
    const restored = notesStore.restoreNote(n.id);
    expect(restored!.archivedAt).toBeNull();
    // No longer in getArchivedNotes
    expect(notesStore.getArchivedNotes().find((x) => x.id === n.id)).toBeUndefined();
    // IS in getActiveNotes
    expect(notesStore.getActiveNotes().find((x) => x.id === n.id)).toBeDefined();
  });

  it('restoreNote() returns undefined for unknown id', () => {
    expect(notesStore.restoreNote('does-not-exist')).toBeUndefined();
  });

  it('getArchivedNotes() returns only archived, sorted desc', () => {
    const a = notesStore.create('a');
    const b = notesStore.create('b');
    const c = notesStore.create('c');
    notesStore.archiveNote(a.id, 100);
    notesStore.archiveNote(b.id, 300);
    notesStore.archiveNote(c.id, 200);
    const archived = notesStore.getArchivedNotes();
    expect(archived.length).toBe(3);
    expect(archived.map((n) => n.id)).toEqual([b.id, c.id, a.id]);
  });

  it('getActiveNotes() excludes archived', () => {
    const active = notesStore.create('active');
    const archived = notesStore.create('archived');
    notesStore.archiveNote(archived.id, 1);
    const result = notesStore.getActiveNotes();
    expect(result.find((n) => n.id === active.id)).toBeDefined();
    expect(result.find((n) => n.id === archived.id)).toBeUndefined();
  });

  it('emptyArchive() permanently removes all archived notes', () => {
    const a = notesStore.create('a');
    const b = notesStore.create('b');
    const c = notesStore.create('c');
    notesStore.archiveNote(a.id, 100);
    notesStore.archiveNote(b.id, 200);
    const removed = notesStore.emptyArchive();
    expect(removed.length).toBe(2);
    expect(notesStore.get(a.id)).toBeUndefined();
    expect(notesStore.get(b.id)).toBeUndefined();
    expect(notesStore.get(c.id)).toBeDefined();
  });

  it('emptyArchive() returns empty array when nothing to empty', () => {
    const removed = notesStore.emptyArchive();
    expect(removed).toEqual([]);
  });
});
