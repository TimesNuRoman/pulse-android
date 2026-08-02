import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { MOCK_NOTES, notesStore, noteTagsList, migrateNotes, parseTagInput, normalizeTag, TAG_RE, MAX_TAGS_PER_NOTE } from '../notesStore';

describe('note tags — schema + validation', () => {
  describe('normalizeTag', () => {
    it('lowercases input', () => {
      expect(normalizeTag('Work')).toBe('work');
      expect(normalizeTag('URGENT')).toBe('urgent');
    });
    it('strips a leading #', () => {
      expect(normalizeTag('#work')).toBe('work');
      expect(normalizeTag('##idea')).toBe('idea');
    });
    it('trims whitespace', () => {
      expect(normalizeTag('  work  ')).toBe('work');
      expect(normalizeTag('\twork\n')).toBe('work');
    });
    it('accepts valid [a-z0-9-]{0,31}', () => {
      expect(normalizeTag('a')).toBe('a');
      expect(normalizeTag('work-1')).toBe('work-1');
      expect(normalizeTag('a'.repeat(32))).toBe('a'.repeat(32));
    });
    it('rejects empty / whitespace-only', () => {
      expect(normalizeTag('')).toBeNull();
      expect(normalizeTag('   ')).toBeNull();
      expect(normalizeTag('#')).toBeNull();
    });
    it('rejects disallowed characters', () => {
      expect(normalizeTag('work!')).toBeNull();
      expect(normalizeTag('foo bar')).toBeNull();
      expect(normalizeTag('foo/bar')).toBeNull();
      expect(normalizeTag('foo.bar')).toBeNull();
      expect(normalizeTag('фыва')).toBeNull(); // cyrillic
      expect(normalizeTag('foo_underscore')).toBeNull();
    });
    it('rejects tags starting with a dash', () => {
      expect(normalizeTag('-work')).toBeNull();
    });
    it('rejects over-length tags (> 32 chars)', () => {
      expect(normalizeTag('a'.repeat(33))).toBeNull();
    });
  });

  describe('parseTagInput', () => {
    it('parses a single tag', () => {
      expect(parseTagInput('work')).toEqual(['work']);
    });
    it('parses comma-separated tags', () => {
      expect(parseTagInput('work, urgent')).toEqual(['work', 'urgent']);
    });
    it('parses #-prefixed shorthand', () => {
      expect(parseTagInput('#work #urgent')).toEqual(['work', 'urgent']);
    });
    it('parses mixed input', () => {
      expect(parseTagInput('#work, urgent, idea')).toEqual(['work', 'urgent', 'idea']);
    });
    it('drops invalid entries', () => {
      expect(parseTagInput('work, bad!, good')).toEqual(['work', 'good']);
    });
    it('dedupes within input', () => {
      expect(parseTagInput('work Work #work')).toEqual(['work']);
    });
    it('returns [] for empty / all-invalid', () => {
      expect(parseTagInput('')).toEqual([]);
      expect(parseTagInput('!@#$%')).toEqual([]);
    });
  });

  it('TAG_RE matches the schema in the brief', () => {
    expect(TAG_RE.test('a')).toBe(true);
    expect(TAG_RE.test('work-1')).toBe(true);
    expect(TAG_RE.test('a'.repeat(32))).toBe(true);
    expect(TAG_RE.test('')).toBe(false);
    expect(TAG_RE.test('-a')).toBe(false);
    expect(TAG_RE.test('a'.repeat(33))).toBe(false);
    expect(TAG_RE.test('A')).toBe(false); // uppercase
    expect(TAG_RE.test('a_b')).toBe(false);
  });
});

describe('note tags — store mutations', () => {
  beforeEach(() => {
    localStorage.clear();
    notesStore.resetToMocks();
  });

  it('addTag() appends a single normalized tag', () => {
    const note = notesStore.create();
    notesStore.addTag(note.id, 'Work');
    expect(notesStore.get(note.id)?.tags).toEqual(['work']);
  });

  it('addTag() is a no-op for invalid input', () => {
    const note = notesStore.create();
    notesStore.addTag(note.id, '!!!');
    expect(notesStore.get(note.id)?.tags).toEqual([]);
  });

  it('addTag() dedupes within a note', () => {
    const note = notesStore.create();
    notesStore.addTag(note.id, 'work');
    notesStore.addTag(note.id, 'work');
    notesStore.addTag(note.id, '#work');
    expect(notesStore.get(note.id)?.tags).toEqual(['work']);
  });

  it('addTag() enforces the 20-tag cap', () => {
    const note = notesStore.create();
    for (let i = 0; i < MAX_TAGS_PER_NOTE + 5; i++) {
      notesStore.addTag(note.id, `tag${i}`);
    }
    expect(notesStore.get(note.id)?.tags?.length).toBe(MAX_TAGS_PER_NOTE);
  });

  it('removeTag() deletes the matching tag', () => {
    const note = notesStore.create();
    notesStore.setTags(note.id, ['a', 'b', 'c']);
    notesStore.removeTag(note.id, 'b');
    expect(notesStore.get(note.id)?.tags).toEqual(['a', 'c']);
  });

  it('removeTag() is a no-op when tag is missing', () => {
    const note = notesStore.create();
    notesStore.setTags(note.id, ['a']);
    notesStore.removeTag(note.id, 'zzz');
    expect(notesStore.get(note.id)?.tags).toEqual(['a']);
  });

  it('setTags() replaces the tag list (with validation)', () => {
    const note = notesStore.create();
    notesStore.setTags(note.id, 'work, urgent, bad!');
    expect(notesStore.get(note.id)?.tags).toEqual(['work', 'urgent']);
  });

  it('setTags() accepts a string array', () => {
    const note = notesStore.create();
    notesStore.setTags(note.id, ['work', 'urgent']);
    expect(notesStore.get(note.id)?.tags).toEqual(['work', 'urgent']);
  });

  it('create() defaults tags to []', () => {
    const note = notesStore.create();
    expect(note.tags).toEqual([]);
  });
});

describe('note tags — listAllTags / filterByTags', () => {
  beforeEach(() => {
    localStorage.clear();
    notesStore.resetToMocks();
  });

  it('listAllTags() returns sorted, unique tags from note.tags', () => {
    // MOCK_NOTES include: planning (2x), welcome, getting-started, smart-engine, a-b-test, ml,
    // roadmap, personal, bangkok, codemirror, editor, mobile, design, ui-rules, telegram, mock,
    // side-project, writing.
    const all = notesStore.listAllTags();
    const tags = all.map((t) => t.tag);
    expect(tags.length).toBeGreaterThan(0);
    // planning appears in n3 (Roadmap) and n4 (Bangkok prep) = 2
    const planning = all.find((t) => t.tag === 'planning');
    expect(planning?.count).toBe(2);
    // Sorted by count desc; verify no out-of-order entries
    for (let i = 1; i < all.length; i++) {
      expect(all[i - 1]!.count).toBeGreaterThanOrEqual(all[i]!.count);
    }
  });

  it('noteTagsList derived store matches listAllTags()', () => {
    const all = notesStore.listAllTags();
    const derived = get(noteTagsList);
    expect(derived.length).toBe(all.length);
    for (let i = 0; i < all.length; i++) {
      expect(derived[i]!.tag).toBe(all[i]!.tag);
      expect(derived[i]!.count).toBe(all[i]!.count);
    }
  });

  it('filterByTags(["planning"]) returns only notes with that tag', () => {
    const result = notesStore.filterByTags(['planning']);
    expect(result.length).toBe(2);
    for (const n of result) {
      expect(n.tags ?? []).toContain('planning');
    }
  });

  it('filterByTags(["planning","work"]) returns OR-matched notes', () => {
    // n1 (welcome), n3 (roadmap/planning), n4 (bangkok/planning) for 'planning';
    // MOCK_NOTES contain no 'work' tag, so the result is just the 2 planning notes.
    const result = notesStore.filterByTags(['planning', 'work']);
    expect(result.length).toBe(2);
  });

  it('filterByTags([]) returns all notes', () => {
    expect(notesStore.filterByTags([]).length).toBe(notesStore.list().length);
  });

  it('addTag / removeTag update listAllTags counts', () => {
    const before = notesStore.listAllTags();
    const beforeCount = before.find((t) => t.tag === 'work')?.count ?? 0;
    const note = notesStore.create();
    notesStore.addTag(note.id, 'work');
    const after = notesStore.listAllTags();
    expect(after.find((t) => t.tag === 'work')?.count).toBe(beforeCount + 1);
    notesStore.removeTag(note.id, 'work');
    const afterRemove = notesStore.listAllTags();
    expect(afterRemove.find((t) => t.tag === 'work')?.count ?? 0).toBe(beforeCount);
  });
});

describe('note tags — non-destructive migration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('migrates notes without a tags field to tags: []', () => {
    // Pre-R140 storage shape: no `tags` field on notes.
    const legacy = [
      { id: 'n1', title: 'A', content: '#a', createdAt: 1, updatedAt: 1 },
      { id: 'n2', title: 'B', content: '#b', createdAt: 1, updatedAt: 1 },
    ];
    const out = migrateNotes(legacy);
    expect(out[0]?.tags).toEqual([]);
    expect(out[1]?.tags).toEqual([]);
  });

  it('preserves an existing tags array (does not overwrite)', () => {
    const withTags = [
      { id: 'n1', title: 'A', content: '#a', tags: ['work'], createdAt: 1, updatedAt: 1 },
    ];
    const out = migrateNotes(withTags);
    expect(out[0]?.tags).toEqual(['work']);
  });

  it('coerces a non-array tags field to []', () => {
    const weird = [
      { id: 'n1', title: 'A', content: '#a', tags: 'work', createdAt: 1, updatedAt: 1 },
    ];
    const out = migrateNotes(weird);
    expect(out[0]?.tags).toEqual([]);
  });

  it('handles a null tags field', () => {
    const nullTags = [
      { id: 'n1', title: 'A', content: '#a', tags: null, createdAt: 1, updatedAt: 1 },
    ];
    const out = migrateNotes(nullTags);
    expect(out[0]?.tags).toEqual([]);
  });

  it('handles an empty input', () => {
    const out = migrateNotes([]);
    expect(out).toEqual([]);
  });
});

describe('MOCK_NOTES sanity', () => {
  it('MOCK_NOTES is now tagged (R140 data enrichment)', () => {
    const tagged = MOCK_NOTES.filter((n) => Array.isArray(n.tags) && n.tags.length > 0);
    expect(tagged.length).toBeGreaterThanOrEqual(5);
    for (const n of tagged) {
      for (const t of n.tags!) {
        expect(TAG_RE.test(t)).toBe(true);
      }
    }
  });
});
