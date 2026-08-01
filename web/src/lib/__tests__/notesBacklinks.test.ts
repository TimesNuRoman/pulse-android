import { describe, it, expect } from 'vitest';
import {
  extractBacklinks,
  extractTags,
  buildBacklinkIndex,
  findBacklinksTo,
  countTags,
  type Note,
} from '../notesBacklinks';

const makeNote = (id: string, title: string, content: string, tags: string[] = []): Note => ({
  id,
  title,
  content,
  createdAt: 0,
  updatedAt: 0,
  tags,
});

describe('extractBacklinks', () => {
  it('returns empty array for no links', () => {
    expect(extractBacklinks('hello world')).toEqual([]);
  });

  it('extracts a single wikilink', () => {
    expect(extractBacklinks('see [[Project Alpha]]')).toEqual(['Project Alpha']);
  });

  it('extracts multiple wikilinks in order', () => {
    expect(extractBacklinks('[[A]] then [[B]] then [[C]]')).toEqual(['A', 'B', 'C']);
  });

  it('deduplicates wikilinks', () => {
    expect(extractBacklinks('[[A]] and [[A]] and [[A]]')).toEqual(['A']);
  });

  it('splits [[Target|alias]] keeping only target', () => {
    expect(extractBacklinks('[[Project A|display]]')).toEqual(['Project A']);
  });

  it('handles empty content', () => {
    expect(extractBacklinks('')).toEqual([]);
  });

  it('skips empty wikilinks [[]]', () => {
    expect(extractBacklinks('[[]] ignored')).toEqual([]);
  });

  it('skips multiline wikilinks', () => {
    expect(extractBacklinks('[[a\nb]] ignored')).toEqual([]);
  });

  it('trims whitespace around target', () => {
    expect(extractBacklinks('[[   Padded   ]]')).toEqual(['Padded']);
  });

  it('handles many at once', () => {
    const src = '[[a]] [[b]] [[c]] [[d]] [[e]] [[f]] [[g]]';
    expect(extractBacklinks(src).length).toBe(7);
  });
});

describe('extractTags', () => {
  it('extracts a single tag', () => {
    expect(extractTags('thinking about #rust')).toEqual(['rust']);
  });

  it('lowercases tags', () => {
    expect(extractTags('#Rust and #RUST and #rust')).toEqual(['rust']);
  });

  it('dedupes', () => {
    expect(extractTags('#a #a #a')).toEqual(['a']);
  });

  it('preserves order of first occurrence', () => {
    expect(extractTags('#b #a #c #a')).toEqual(['b', 'a', 'c']);
  });

  it('skips CSS hex colors (#ff00aa) preceded by colon', () => {
    expect(extractTags('color: #ff00aa')).toEqual([]);
  });

  it('extracts #tag at start of line', () => {
    expect(extractTags('#morning standup')).toEqual(['morning']);
  });

  it('extracts multiple tags in one line', () => {
    expect(extractTags('#rust #wasm #tailwind')).toEqual(['rust', 'wasm', 'tailwind']);
  });

  it('supports hyphens and underscores', () => {
    expect(extractTags('#smart-engine #ai_native')).toEqual(['smart-engine', 'ai_native']);
  });

  it('skips lone #', () => {
    expect(extractTags('just a # here')).toEqual([]);
  });

  it('handles empty content', () => {
    expect(extractTags('')).toEqual([]);
  });

  it('handles max length (64 chars total word)', () => {
    const long = 'a'.repeat(64);
    expect(extractTags(`#${long}`)).toEqual([long]);
  });
});

describe('buildBacklinkIndex', () => {
  it('returns empty map for empty notes array', () => {
    const idx = buildBacklinkIndex([]);
    expect(idx.size).toBe(0);
  });

  it('indexes a single backlink', () => {
    const noteA = makeNote('1', 'A', 'link to [[B]]');
    const idx = buildBacklinkIndex([noteA]);
    expect(idx.get('b')).toEqual([noteA]);
  });

  it('indexes multiple sources per target', () => {
    const a = makeNote('1', 'A', 'see [[Target]]');
    const b = makeNote('2', 'B', 'also [[Target]]');
    const c = makeNote('3', 'C', 'and [[Target]]');
    const idx = buildBacklinkIndex([a, b, c]);
    const sources = idx.get('target');
    expect(sources?.length).toBe(3);
    expect(sources?.map((n) => n.id)).toEqual(['1', '2', '3']);
  });

  it('case-insensitive target lookup', () => {
    const a = makeNote('1', 'A', '[[MyNote]]');
    const b = makeNote('2', 'B', '[[MYNOTE]]');
    const idx = buildBacklinkIndex([a, b]);
    expect(idx.size).toBe(1);
    expect(idx.get('mynote')?.length).toBe(2);
  });

  it('does not double-count a note with duplicate wikilinks to same target', () => {
    const a = makeNote('1', 'A', '[[T]] and [[T]] and [[T]]');
    const idx = buildBacklinkIndex([a]);
    expect(idx.get('t')?.length).toBe(1);
  });

  it('handles notes with no backlinks', () => {
    const a = makeNote('1', 'A', 'no links here');
    const idx = buildBacklinkIndex([a]);
    expect(idx.size).toBe(0);
  });
});

describe('findBacklinksTo', () => {
  it('returns notes that link to the given title', () => {
    const a = makeNote('1', 'Source', '[[Goal]]');
    const b = makeNote('2', 'Unrelated', 'no links');
    const out = findBacklinksTo('Goal', [a, b]);
    expect(out).toEqual([a]);
  });

  it('case-insensitive', () => {
    const a = makeNote('1', 'Source', '[[MyNote]]');
    expect(findBacklinksTo('mynote', [a])).toEqual([a]);
    expect(findBacklinksTo('MYNOTE', [a])).toEqual([a]);
  });

  it('returns empty array for empty title', () => {
    expect(findBacklinksTo('', [])).toEqual([]);
  });

  it('returns empty array when no notes match', () => {
    expect(findBacklinksTo('Nothing', [makeNote('1', 'A', '[[B]]')])).toEqual([]);
  });
});

describe('countTags', () => {
  it('counts tag frequency', () => {
    const notes = [
      makeNote('1', 'A', '#rust #wasm'),
      makeNote('2', 'B', '#rust'),
      makeNote('3', 'C', '#wasm #ai'),
    ];
    const counts = countTags(notes);
    expect(counts.get('rust')).toBe(2);
    expect(counts.get('wasm')).toBe(2);
    expect(counts.get('ai')).toBe(1);
  });

  it('returns empty map for empty array', () => {
    expect(countTags([]).size).toBe(0);
  });

  it('lowercases tag names', () => {
    const notes = [makeNote('1', 'A', '#Rust #RUST #rust')];
    const counts = countTags(notes);
    expect(counts.get('rust')).toBe(3);
  });
});
