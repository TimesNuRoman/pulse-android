// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { searchNotes, scoreNoteForTest, normalizeQuery, MAX_RESULTS, SCORE } from '../notesSearch';
import type { Note } from '../notesBacklinks';

const makeNote = (
  id: string,
  title: string,
  content: string,
  tags: string[] = [],
  createdAt = 0,
  updatedAt = 0,
): Note => ({ id, title, content, createdAt, updatedAt, tags });

describe('normalizeQuery', () => {
  it('lowercases and trims', () => {
    expect(normalizeQuery('  HELLO  ')).toBe('hello');
  });
  it('collapses internal whitespace', () => {
    expect(normalizeQuery('hello   world')).toBe('hello world');
  });
  it('strips diacritics (NFD decompose + drop combining marks)', () => {
    expect(normalizeQuery('café')).toBe('cafe');
    expect(normalizeQuery('naïve résumé')).toBe('naive resume');
  });
  it('returns empty string for empty / whitespace-only input', () => {
    expect(normalizeQuery('')).toBe('');
    expect(normalizeQuery('   ')).toBe('');
  });
  it('preserves Cyrillic', () => {
    expect(normalizeQuery('Встреча')).toBe('встреча');
  });
});

describe('searchNotes — empty query', () => {
  it('returns the input array unchanged when query is empty', () => {
    const notes = [makeNote('1', 'A', 'a'), makeNote('2', 'B', 'b')];
    expect(searchNotes(notes, '')).toBe(notes);
  });
  it('returns the input array unchanged when query is whitespace only', () => {
    const notes = [makeNote('1', 'A', 'a')];
    expect(searchNotes(notes, '   ')).toBe(notes);
  });
});

describe('searchNotes — 6-level ranking', () => {
  const titleNote = makeNote('t', 'Rust tutorial', 'Learn the borrow checker');
  // content has "rust" as a non-boundary substring inside "frustrating".
  const subNote = makeNote('s', 'A diary', 'A frustrating day at the office');
  const wordNote = makeNote('w', 'Front-end', 'A rust-themed blog post about widgets');
  const noMatch = makeNote('n', 'Cooking', 'How to bake sourdough bread');

  it('exact match scores highest', () => {
    const r = searchNotes([titleNote, subNote, wordNote, noMatch], 'rust tutorial');
    expect(r[0]?.id).toBe('t');
    expect(scoreNoteForTest(titleNote, 'rust tutorial')?.score).toBe(SCORE.EXACT);
  });

  it('prefix beats substring', () => {
    const r = searchNotes([titleNote, subNote, wordNote, noMatch], 'rust');
    // "Rust tutorial" → PREFIX (500). "A frustrating day" → SUBSTRING (100).
    expect(r[0]?.id).toBe('t');
    const titleScore = scoreNoteForTest(titleNote, 'rust')?.score ?? 0;
    const subScore = scoreNoteForTest(subNote, 'rust')?.score ?? 0;
    expect(titleScore).toBe(SCORE.PREFIX);
    expect(subScore).toBe(SCORE.SUBSTRING);
    expect(titleScore).toBeGreaterThan(subScore);
  });

  it('word-boundary beats substring', () => {
    // "rust" as a whole word in content vs "rust" as a substring inside "frustrating".
    const wbound = makeNote('wb', 'A note', 'Here is the rust word');
    const r = searchNotes([wbound, subNote], 'rust');
    expect(r[0]?.id).toBe('wb');
    expect(scoreNoteForTest(wbound, 'rust')?.score).toBe(SCORE.WORD_BOUNDARY);
    expect(scoreNoteForTest(subNote, 'rust')?.score).toBe(SCORE.SUBSTRING);
  });
});

describe('searchNotes — diacritics & Cyrillic', () => {
  it('diacritic-fold: "cafe" matches "café note"', () => {
    const notes = [makeNote('1', 'Café note', 'A small coffee shop review')];
    const r = searchNotes(notes, 'cafe');
    expect(r.length).toBe(1);
    expect(r[0]?.id).toBe('1');
  });
  it('diacritic-fold: query with diacritics also matches base form', () => {
    const notes = [makeNote('1', 'cafe north', 'A small coffee shop review')];
    const r = searchNotes(notes, 'café');
    expect(r.length).toBe(1);
  });

  it('Cyrillic: "встреча" matches "встреча с командой"', () => {
    const notes = [makeNote('1', 'Встреча с командой', 'Обсудили план')];
    const r = searchNotes(notes, 'встреча');
    expect(r.length).toBe(1);
    expect(r[0]?.id).toBe('1');
  });
});

describe('searchNotes — tag match', () => {
  it('matches via the declared tags array', () => {
    const notes = [
      makeNote('1', 'Untitled', 'no tags here', ['rust', 'wasm']),
      makeNote('2', 'Other', 'totally unrelated content about cooking'),
    ];
    const r = searchNotes(notes, 'rust');
    expect(r.length).toBe(1);
    expect(r[0]?.id).toBe('1');
  });
  it('matches via tags extracted from content (extractTags)', () => {
    const notes = [
      makeNote('1', 'Quick note', 'Thinking about #rust and #wasm today'),
      makeNote('2', 'Other', 'cooking recipes'),
    ];
    const r = searchNotes(notes, 'wasm');
    expect(r.length).toBe(1);
    expect(r[0]?.id).toBe('1');
  });
});

describe('searchNotes — multi-word', () => {
  it('"meeting notes" matches title with both words in order', () => {
    const notes = [
      makeNote('1', 'Meeting notes — Tuesday', 'Discussion summary'),
      makeNote('2', 'Notes from meeting', 'long form'),
      makeNote('3', 'Just a title', 'no match here'),
    ];
    const r = searchNotes(notes, 'meeting notes');
    // Both notes have "meeting" and "notes" but in different order.
    // The test asserts BOTH are returned and "Meeting notes" (exact prefix
    // match on first word) ranks first.
    expect(r.length).toBe(2);
    expect(r[0]?.id).toBe('1');
  });
});

describe('searchNotes — sorting & tiebreaks', () => {
  it('ranks by score high → low', () => {
    const notes = [
      makeNote('sub', 'JavaScript engines', 'How V8 handles JavaScript workloads'),
      makeNote('t', 'Rust tutorial', 'Learn the borrow checker'),
      makeNote('n', 'No match', 'cooking'),
    ];
    const r = searchNotes(notes, 'rust');
    expect(r.map((n) => n.id)).toEqual(['t']);
  });

  it('tiebreaks by updatedAt desc when scores equal', () => {
    const notes = [
      makeNote('old', 'Rust', 'old content', [], 100, 100),
      makeNote('new', 'Rust', 'new content', [], 200, 200),
    ];
    const r = searchNotes(notes, 'rust');
    // Both have exact title match → tied. updatedAt tiebreak: 200 first.
    expect(r.map((n) => n.id)).toEqual(['new', 'old']);
  });

  it('tiebreaks by createdAt desc when updatedAt also equal', () => {
    const notes = [
      makeNote('older', 'Rust', 'a', [], 100, 500),
      makeNote('newer', 'Rust', 'a', [], 200, 500),
    ];
    const r = searchNotes(notes, 'rust');
    expect(r.map((n) => n.id)).toEqual(['newer', 'older']);
  });
});

describe('searchNotes — cap', () => {
  it('caps results at MAX_RESULTS (100)', () => {
    const notes = Array.from({ length: 150 }, (_, i) =>
      makeNote(`n${i}`, `Note ${i}`, 'rust content', []),
    );
    const r = searchNotes(notes, 'rust');
    expect(r.length).toBe(MAX_RESULTS);
    expect(MAX_RESULTS).toBe(100);
  });
});

describe('searchNotes — performance', () => {
  it('1000 notes × 10-char query < 50ms (smoke)', () => {
    const notes: Note[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `n${i}`,
      title: `Note ${i} about something`,
      content:
        'lorem ipsum dolor sit amet consectetur adipiscing elit ' +
        'sed do eiusmod tempor incididunt ut labore et dolore magna aliqua',
      createdAt: i,
      updatedAt: i,
      tags: [`tag${i % 10}`],
    }));
    const t0 = performance.now();
    const r = searchNotes(notes, 'consectetur');
    const dt = performance.now() - t0;
    expect(r.length).toBeGreaterThan(0);
    expect(dt).toBeLessThan(50);
  });
});
