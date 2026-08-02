import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { MOCK_NOTES, notesStore, sortedNotes, allTags, backlinkIndex } from '../notesStore';

describe('notesStore', () => {
  beforeEach(() => {
    localStorage.clear();
    notesStore.resetToMocks();
  });

  it('initializes with 8 mock notes', () => {
    const list = notesStore.list();
    expect(list.length).toBe(8);
  });

  it('MOCK_NOTES has 8 entries with id and title', () => {
    expect(MOCK_NOTES.length).toBe(8);
    for (const n of MOCK_NOTES) {
      expect(n.id).toBeTruthy();
      expect(n.title).toBeTruthy();
      expect(n.content).toBeTruthy();
      expect(typeof n.createdAt).toBe('number');
      expect(typeof n.updatedAt).toBe('number');
    }
  });

  it('create() adds a new note to the top', () => {
    const before = notesStore.list().length;
    const note = notesStore.create('# fresh');
    expect(notesStore.list().length).toBe(before + 1);
    expect(note.content).toBe('# fresh');
    expect(note.id).toBeTruthy();
  });

  it('update() mutates the note', () => {
    const note = notesStore.create();
    notesStore.update(note.id, { title: 'New title', content: 'new content' });
    const got = notesStore.get(note.id);
    expect(got?.title).toBe('New title');
    expect(got?.content).toBe('new content');
  });

  it('update() bumps updatedAt', () => {
    const note = notesStore.create();
    const before = note.updatedAt;
    // wait a tick
    vi.useFakeTimers();
    vi.advanceTimersByTime(100);
    notesStore.update(note.id, { content: 'changed' });
    const got = notesStore.get(note.id);
    expect(got!.updatedAt).toBeGreaterThan(before);
    vi.useRealTimers();
  });

  it('delete() removes the note', () => {
    const note = notesStore.create();
    expect(notesStore.get(note.id)).toBeDefined();
    notesStore.delete(note.id);
    expect(notesStore.get(note.id)).toBeUndefined();
  });

  // R136 — wikilink stub creation
  it('createStubNote() creates a new note with the given title and a back-link body', () => {
    const source = notesStore.create('source content');
    const before = notesStore.list().length;
    const stub = notesStore.createStubNote('Future Topic', source.id);
    expect(notesStore.list().length).toBe(before + 1);
    expect(stub.title).toBe('Future Topic');
    expect(stub.id).toBeTruthy();
    expect(stub.content).toContain('Created from [[Untitled]]');
    expect(stub.content).not.toContain('this note');
  });

  it('createStubNote() falls back to "this note" when source is missing', () => {
    const stub = notesStore.createStubNote('Orphan', '');
    expect(stub.content).toContain('Created from [[this note]]');
  });

  it('get() returns undefined for unknown id', () => {
    expect(notesStore.get('does-not-exist')).toBeUndefined();
  });

  it('list() returns the same array reference is NOT guaranteed (caller should not mutate)', () => {
    const a = notesStore.list();
    const b = notesStore.list();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('resetToMocks() restores the original 8 notes', () => {
    const created = notesStore.create();
    notesStore.delete(created.id);
    notesStore.delete(notesStore.list()[0].id);
    notesStore.resetToMocks();
    expect(notesStore.list().length).toBe(8);
  });
});

describe('derived stores', () => {
  beforeEach(() => {
    localStorage.clear();
    notesStore.resetToMocks();
  });

  it('sortedNotes sorts by updatedAt descending', () => {
    const list = get(sortedNotes);
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1].updatedAt).toBeGreaterThanOrEqual(list[i].updatedAt);
    }
  });

  it('allTags returns tag list sorted by count', () => {
    const tags = get(allTags);
    for (let i = 1; i < tags.length; i++) {
      expect(tags[i - 1].count).toBeGreaterThanOrEqual(tags[i].count);
    }
  });

  it('backlinkIndex indexes wikilinks', () => {
    const idx = get(backlinkIndex);
    // "Welcome to Pulse Notes" is linked from multiple notes
    const sources = idx.get('welcome to pulse notes');
    expect(sources).toBeDefined();
    expect(sources!.length).toBeGreaterThanOrEqual(2);
  });

  it('backlinkIndex is keyed by target note title', () => {
    const idx = get(backlinkIndex);
    // "Welcome to Pulse Notes" is the most-linked target in MOCK_NOTES
    // (linked from n2 Smart Engine, n3 Roadmap, n5 CodeMirror, n6 Pulse UI rules, n7 Telegram)
    const sources = idx.get('welcome to pulse notes');
    expect(sources).toBeDefined();
    expect(sources!.length).toBeGreaterThanOrEqual(3);
    // n2 (Smart Engine v3) is linked from n1 (Welcome) and n3 (Roadmap)
    const smartEngine = idx.get('smart engine v3');
    expect(smartEngine?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
