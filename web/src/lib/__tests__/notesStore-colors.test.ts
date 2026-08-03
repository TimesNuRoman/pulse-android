// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { notesStore, sortedNotes } from '../notesStore';
import type { NoteColor } from '../noteColors';

describe('notesStore.setColor (R196)', () => {
  beforeEach(() => {
    localStorage.clear();
    notesStore.resetToMocks();
  });

  it('setColor updates the note in memory and returns the updated note', () => {
    const target = notesStore.list()[0];
    expect(target).toBeDefined();
    const result = notesStore.setColor(target.id, 'red');
    expect(result).toBeDefined();
    expect(result!.color).toBe('red');
    const got = notesStore.get(target.id);
    expect(got?.color).toBe('red');
  });

  it('setColor with "none" clears the color field to null', () => {
    const target = notesStore.list()[0];
    notesStore.setColor(target.id, 'blue');
    expect(notesStore.get(target.id)?.color).toBe('blue');
    const cleared = notesStore.setColor(target.id, 'none');
    expect(cleared?.color).toBeNull();
    expect(notesStore.get(target.id)?.color).toBeNull();
  });

  it('setColor with null also clears the color field to null', () => {
    const target = notesStore.list()[0];
    notesStore.setColor(target.id, 'blue');
    const cleared = notesStore.setColor(target.id, null);
    expect(cleared?.color).toBeNull();
    expect(notesStore.get(target.id)?.color).toBeNull();
  });

  it('setColor on a non-existent noteId returns undefined and does not crash', () => {
    const before = notesStore.list().length;
    const result = notesStore.setColor('does-not-exist', 'red');
    expect(result).toBeUndefined();
    expect(notesStore.list().length).toBe(before);
  });

  it('setColor with an invalid color string no-ops defensively', () => {
    const target = notesStore.list()[0];
    const result = notesStore.setColor(target.id, 'magenta' as unknown as NoteColor);
    expect(result).toBeUndefined();
    expect(notesStore.get(target.id)?.color).toBeUndefined();
  });

  it('setColor persists the new color to localStorage', () => {
    const target = notesStore.list()[0];
    notesStore.setColor(target.id, 'green');
    const raw = localStorage.getItem('pulse.notes.v1');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as Array<{ id: string; color?: string }>;
    const stored = parsed.find((n) => n.id === target.id);
    expect(stored?.color).toBe('green');
  });

  it('setColor fires the Svelte store update — sortedNotes consumers see the new value', () => {
    const target = notesStore.list()[0];
    const before = get(sortedNotes).find((n) => n.id === target.id);
    expect(before?.color).toBeFalsy();
    notesStore.setColor(target.id, 'purple');
    const after = get(sortedNotes).find((n) => n.id === target.id);
    expect(after?.color).toBe('purple');
  });

  it('setColor bumps updatedAt (color change is a meaningful edit)', () => {
    const target = notesStore.list()[0];
    const before = notesStore.get(target.id)!.updatedAt;
    notesStore.setColor(target.id, 'yellow');
    const after = notesStore.get(target.id)!;
    expect(after.updatedAt).toBeGreaterThanOrEqual(before);
  });
});

describe('notesStore.getNotesByColor (R196)', () => {
  beforeEach(() => {
    localStorage.clear();
    notesStore.resetToMocks();
  });

  it('returns only notes matching the given color', () => {
    const a = notesStore.list()[0];
    const b = notesStore.list()[1];
    notesStore.setColor(a.id, 'red');
    notesStore.setColor(b.id, 'blue');
    const reds = notesStore.getNotesByColor('red');
    expect(reds.length).toBe(1);
    expect(reds[0]?.id).toBe(a.id);
    const blues = notesStore.getNotesByColor('blue');
    expect(blues.length).toBe(1);
    expect(blues[0]?.id).toBe(b.id);
  });

  it('"none" returns notes without any color set', () => {
    const a = notesStore.list()[0];
    notesStore.setColor(a.id, 'red');
    const noColor = notesStore.getNotesByColor('none');
    expect(noColor.length).toBe(notesStore.list().length - 1);
    expect(noColor.find((n) => n.id === a.id)).toBeUndefined();
  });

  it('returns an empty array when no notes match', () => {
    expect(notesStore.getNotesByColor('pink').length).toBe(0);
  });
});
