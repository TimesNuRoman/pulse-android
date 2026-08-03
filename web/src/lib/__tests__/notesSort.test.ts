// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { sortNotes } from '../notesSort';
import type { Note } from '../notesBacklinks';

/**
 * Build a Note from a partial. Defaults fill in the required fields so
 * each test can focus on the fields it cares about. The caller is still
 * allowed to omit a field by passing `undefined` and then deleting it on
 * the returned object — that's how we test the "missing updatedAt"
 * fallback.
 */
function makeNote(overrides: Partial<Note> & { id: string }): Note {
  return {
    id: overrides.id,
    title: overrides.title ?? `Note ${overrides.id}`,
    content: overrides.content ?? '',
    createdAt: overrides.createdAt ?? 0,
    updatedAt: overrides.updatedAt ?? 0,
    ...overrides,
  };
}

describe('sortNotes', () => {
  it('returns [] for empty input', () => {
    expect(sortNotes([])).toEqual([]);
  });

  it('returns the single note unchanged for a 1-element input', () => {
    const only = makeNote({ id: 'a', updatedAt: 100 });
    const result = sortNotes([only]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('sorts unpinned notes by updatedAt desc', () => {
    const a = makeNote({ id: 'a', updatedAt: 100 });
    const b = makeNote({ id: 'b', updatedAt: 300 });
    const c = makeNote({ id: 'c', updatedAt: 200 });
    expect(sortNotes([a, b, c]).map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });

  it('puts pinned notes first, regardless of updatedAt', () => {
    const oldPinned = makeNote({
      id: 'old',
      updatedAt: 100,
      pinnedAt: '2026-01-01T00:00:00.000Z',
    });
    const freshUnpinned = makeNote({ id: 'fresh', updatedAt: 999 });
    expect(sortNotes([freshUnpinned, oldPinned]).map((x) => x.id)).toEqual([
      'old',
      'fresh',
    ]);
  });

  it('sorts pinned notes by pinnedAt desc (most recently pinned wins)', () => {
    const pinnedFirst = makeNote({
      id: 'first',
      updatedAt: 100,
      pinnedAt: '2026-01-01T00:00:00.000Z',
    });
    const pinnedRecent = makeNote({
      id: 'recent',
      updatedAt: 100,
      pinnedAt: '2026-08-01T00:00:00.000Z',
    });
    expect(sortNotes([pinnedFirst, pinnedRecent]).map((x) => x.id)).toEqual([
      'recent',
      'first',
    ]);
  });

  it('breaks an updatedAt tie by createdAt desc', () => {
    const older = makeNote({ id: 'a', updatedAt: 100, createdAt: 50 });
    const newer = makeNote({ id: 'b', updatedAt: 100, createdAt: 200 });
    expect(sortNotes([older, newer]).map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('falls back to createdAt when updatedAt is missing', () => {
    // Simulate a legacy note without updatedAt.
    const a = {
      id: 'a',
      title: 'A',
      content: '',
      createdAt: 100,
    } as unknown as Note;
    const b = makeNote({ id: 'b', updatedAt: 200, createdAt: 50 });
    expect(sortNotes([a, b]).map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('treats missing pinnedAt as unpinned', () => {
    const oldPinned = makeNote({
      id: 'old',
      updatedAt: 100,
      pinnedAt: '2026-01-01T00:00:00.000Z',
    });
    const freshNoPin = { ...makeNote({ id: 'fresh', updatedAt: 999 }) };
    delete (freshNoPin as { pinnedAt?: string | null }).pinnedAt;
    expect(sortNotes([freshNoPin, oldPinned]).map((x) => x.id)).toEqual([
      'old',
      'fresh',
    ]);
  });

  it('treats explicit pinnedAt: null as unpinned', () => {
    const a = makeNote({ id: 'a', updatedAt: 100, pinnedAt: null });
    const b = makeNote({ id: 'b', updatedAt: 300, pinnedAt: null });
    expect(sortNotes([a, b]).map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('treats an unparseable pinnedAt string as unpinned', () => {
    const a = makeNote({ id: 'a', updatedAt: 100, pinnedAt: 'not-a-date' });
    const b = makeNote({ id: 'b', updatedAt: 300, pinnedAt: null });
    expect(sortNotes([a, b]).map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('does not mutate the input array (order preserved)', () => {
    const a = makeNote({ id: 'a', updatedAt: 100 });
    const b = makeNote({ id: 'b', updatedAt: 300 });
    const input = [a, b];
    const snapshot = [...input];
    sortNotes(input);
    expect(input).toEqual(snapshot);
  });

  it('does not mutate individual notes (returns same references)', () => {
    const a = makeNote({ id: 'a', updatedAt: 100, pinnedAt: null });
    const result = sortNotes([a]);
    // Same object reference, no defensive clone. Lets Svelte 5's
    // reactivity recognize the unchanged note.
    expect(result[0]).toBe(a);
  });

  it('sorts by updatedAt, not by id', () => {
    const zLowUpd = makeNote({ id: 'z', updatedAt: 100 });
    const aHighUpd = makeNote({ id: 'a', updatedAt: 300 });
    expect(sortNotes([zLowUpd, aHighUpd]).map((x) => x.id)).toEqual(['a', 'z']);
  });

  it('preserves input order when updatedAt and createdAt are both equal (stable sort)', () => {
    const a = makeNote({ id: 'a', updatedAt: 100, createdAt: 100 });
    const b = makeNote({ id: 'b', updatedAt: 100, createdAt: 100 });
    const c = makeNote({ id: 'c', updatedAt: 100, createdAt: 100 });
    expect(sortNotes([a, b, c]).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('handles a mix of multiple pinned and unpinned notes correctly', () => {
    const u1 = makeNote({ id: 'u1', updatedAt: 500 });
    const p1 = makeNote({
      id: 'p1',
      updatedAt: 100,
      pinnedAt: '2026-01-01T00:00:00.000Z',
    });
    const u2 = makeNote({ id: 'u2', updatedAt: 999 });
    const p2 = makeNote({
      id: 'p2',
      updatedAt: 50,
      pinnedAt: '2026-08-01T00:00:00.000Z',
    });
    const u3 = makeNote({ id: 'u3', updatedAt: 200 });
    expect(sortNotes([u1, p1, u2, p2, u3]).map((x) => x.id)).toEqual([
      'p2',
      'p1',
      'u2',
      'u1',
      'u3',
    ]);
  });
});
