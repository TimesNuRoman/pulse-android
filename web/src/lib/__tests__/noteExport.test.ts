// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import {
  NOTE_EXPORT_VERSION,
  buildNoteFilename,
  deriveFilenameSlug,
  exportNoteAsJson,
  exportNoteAsMarkdown,
  getAppVersion,
  parseNoteExport,
  slugifyTitle,
  todayDateStamp,
} from '../noteExport';
import type { Note } from '../notesBacklinks';

const NOTE_FIXED_DATE = new Date('2026-08-03T12:34:56.789Z');

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'abc12345-full-id',
    title: 'My note',
    content: 'Note body here.\n\nMarkdown preserved.',
    createdAt: Date.parse('2026-08-01T10:00:00.000Z'),
    updatedAt: Date.parse('2026-08-03T12:34:00.000Z'),
    tags: ['alpha', 'beta'],
    ...overrides,
  };
}

describe('slugifyTitle', () => {
  it('lowercases and replaces spaces with dashes', () => {
    expect(slugifyTitle('Hello World')).toBe('hello-world');
  });

  it('strips punctuation', () => {
    expect(slugifyTitle('Hello, World!')).toBe('hello-world');
  });

  it('collapses consecutive non-alphanumerics into a single dash', () => {
    expect(slugifyTitle('a  -  b___c')).toBe('a-b-c');
  });

  it('trims leading and trailing dashes', () => {
    expect(slugifyTitle('---foo---')).toBe('foo');
  });

  it('caps at 40 chars and trims a trailing dash', () => {
    const long = 'a'.repeat(50);
    expect(slugifyTitle(long)).toBe('a'.repeat(40));
  });

  it('returns empty for non-ASCII titles (fallback chain handles it)', () => {
    expect(slugifyTitle('日本語')).toBe('');
  });

  it('returns empty for whitespace-only input', () => {
    expect(slugifyTitle('   ')).toBe('');
  });
});

describe('deriveFilenameSlug', () => {
  it('uses the title when present', () => {
    expect(deriveFilenameSlug(makeNote({ title: 'Hello World' }))).toBe('hello-world');
  });

  it('falls back to body when title is empty', () => {
    expect(deriveFilenameSlug(makeNote({ title: '', content: 'Body preview goes here' }))).toBe(
      'body-preview-goes-here',
    );
  });

  it('falls back to body when title is non-ASCII only', () => {
    expect(deriveFilenameSlug(makeNote({ title: '日本語', content: 'hello world' }))).toBe(
      'hello-world',
    );
  });

  it('falls back to id (first 8 chars) when title and body are both empty', () => {
    expect(deriveFilenameSlug(makeNote({ title: '', content: '', id: 'abcd1234-full-id' }))).toBe(
      'abcd1234',
    );
  });

  it('falls back to id (first 8 chars) when both slugify to empty', () => {
    expect(
      deriveFilenameSlug(makeNote({ title: '   ', content: '日本語', id: 'xyz99999-full' })),
    ).toBe('xyz99999');
  });
});

describe('buildNoteFilename', () => {
  it('returns pulse-note-YYYY-MM-DD-slug.json', () => {
    expect(buildNoteFilename(makeNote(), 'json', { date: NOTE_FIXED_DATE })).toBe(
      'pulse-note-2026-08-03-my-note.json',
    );
  });

  it('returns .md extension for markdown format', () => {
    expect(buildNoteFilename(makeNote(), 'md', { date: NOTE_FIXED_DATE })).toBe(
      'pulse-note-2026-08-03-my-note.md',
    );
  });

  it('uses id fallback when both title and body are empty', () => {
    expect(
      buildNoteFilename(makeNote({ title: '', content: '', id: 'deadbeef-full' }), 'json', {
        date: NOTE_FIXED_DATE,
      }),
    ).toBe('pulse-note-2026-08-03-deadbeef.json');
  });

  it('defaults the date to today (new Date())', () => {
    const name = buildNoteFilename(makeNote(), 'md');
    expect(name.startsWith('pulse-note-')).toBe(true);
    expect(name.endsWith('-my-note.md')).toBe(true);
    // The date segment is YYYY-MM-DD = 10 chars
    expect(name.split('-').slice(2, 5).join('-').length).toBe(10);
  });
});

describe('todayDateStamp', () => {
  it('formats a fixed date as YYYY-MM-DD in UTC', () => {
    expect(todayDateStamp(NOTE_FIXED_DATE)).toBe('2026-08-03');
  });

  it('zero-pads single-digit month and day', () => {
    expect(todayDateStamp(new Date('2026-01-05T00:00:00.000Z'))).toBe('2026-01-05');
  });
});

describe('getAppVersion', () => {
  it('returns the VITE_APP_VERSION env value when set', () => {
    // import.meta.env is replaced by Vite at build time. In vitest
    // it's a real object we can override in setupFiles if needed,
    // but the helper gracefully falls back when the var is absent.
    const v = getAppVersion();
    expect(typeof v).toBe('string');
    expect(v.length).toBeGreaterThan(0);
  });
});

describe('exportNoteAsJson', () => {
  it('produces pretty-printed JSON that round-trips through JSON.parse', () => {
    const out = exportNoteAsJson(makeNote(), {
      appVersion: '0.6.7',
      now: NOTE_FIXED_DATE,
    });
    const parsed = JSON.parse(out);
    expect(parsed).toBeTypeOf('object');
  });

  it('contains version, exportedAt, appVersion, and a singular note envelope', () => {
    const parsed = JSON.parse(
      exportNoteAsJson(makeNote(), { appVersion: '0.6.7', now: NOTE_FIXED_DATE }),
    );
    expect(parsed.version).toBe(NOTE_EXPORT_VERSION);
    expect(parsed.version).toBe(1);
    expect(parsed.exportedAt).toBe('2026-08-03T12:34:56.789Z');
    expect(parsed.appVersion).toBe('0.6.7');
    expect(parsed.note).toBeDefined();
    expect(parsed.note.id).toBe('abc12345-full-id');
    expect(parsed.note.title).toBe('My note');
    expect(parsed.note.content).toBe('Note body here.\n\nMarkdown preserved.');
    expect(parsed.note.tags).toEqual(['alpha', 'beta']);
  });

  it('omits the tags key when the note has no tags', () => {
    const note = makeNote({ tags: undefined });
    const parsed = JSON.parse(
      exportNoteAsJson(note, { appVersion: '0.6.7', now: NOTE_FIXED_DATE }),
    );
    expect('tags' in parsed.note).toBe(false);
  });

  it('does not alias the input tags array', () => {
    const tags = ['alpha', 'beta'];
    const note = makeNote({ tags });
    const parsed = JSON.parse(
      exportNoteAsJson(note, { appVersion: '0.6.7', now: NOTE_FIXED_DATE }),
    );
    parsed.note.tags.push('gamma');
    expect(tags).toEqual(['alpha', 'beta']);
  });

  it('is deterministic for the same inputs (modulo exportedAt)', () => {
    const a = exportNoteAsJson(makeNote(), { appVersion: '0.6.7', now: NOTE_FIXED_DATE });
    const b = exportNoteAsJson(makeNote(), { appVersion: '0.6.7', now: NOTE_FIXED_DATE });
    expect(a).toBe(b);
  });
});

describe('exportNoteAsMarkdown', () => {
  it('starts with --- and ends the frontmatter with ---', () => {
    const md = exportNoteAsMarkdown(makeNote());
    const lines = md.split('\n');
    expect(lines[0]).toBe('---');
    // The second `---` closes the frontmatter; we search for it.
    const closeIdx = lines.indexOf('---', 1);
    expect(closeIdx).toBeGreaterThan(1);
  });

  it('includes the id, title, tags, and dates in the frontmatter', () => {
    const md = exportNoteAsMarkdown(makeNote());
    expect(md).toContain('id: abc12345-full-id');
    expect(md).toContain('title: My note');
    expect(md).toContain('tags: [alpha, beta]');
    expect(md).toContain('createdAt: 2026-08-01T10:00:00.000Z');
    expect(md).toContain('updatedAt: 2026-08-03T12:34:00.000Z');
  });

  it('omits the tags frontmatter line when tags are missing', () => {
    const md = exportNoteAsMarkdown(makeNote({ tags: undefined }));
    expect(md).not.toContain('tags:');
  });

  it('renders the body verbatim after the H1 header', () => {
    const md = exportNoteAsMarkdown(makeNote());
    const afterFm = md.split('---').slice(2).join('---').trimStart();
    expect(afterFm.startsWith('# My note\n')).toBe(true);
    expect(afterFm).toContain('Note body here.');
    expect(afterFm).toContain('Markdown preserved.');
  });

  it('handles empty body: frontmatter + # title only', () => {
    const md = exportNoteAsMarkdown(makeNote({ content: '' }));
    const lines = md.split('\n');
    expect(lines).toContain('# My note');
    // No extra body lines after the H1
    expect(lines[lines.length - 1]).toBe('');
  });

  it('handles empty title: renders `# ` followed by the body', () => {
    const md = exportNoteAsMarkdown(makeNote({ title: '' }));
    expect(md).toContain('# \n');
    // Frontmatter must still quote the empty title safely.
    expect(md).toContain('title: ""');
  });

  it('quotes titles that contain YAML-unsafe characters', () => {
    const md = exportNoteAsMarkdown(makeNote({ title: 'note: with colon' }));
    expect(md).toContain('title: "note: with colon"');
  });

  it('quotes titles that are YAML reserved tokens', () => {
    const md = exportNoteAsMarkdown(makeNote({ title: 'true' }));
    expect(md).toContain('title: "true"');
  });

  it('appends a single trailing newline when the body is not newline-terminated', () => {
    const md = exportNoteAsMarkdown(makeNote({ content: 'no trailing newline' }));
    expect(md.endsWith('\n')).toBe(true);
    expect(md.endsWith('no trailing newline\n')).toBe(true);
  });

  it('does not add an extra trailing newline when the body already ends in one', () => {
    const md = exportNoteAsMarkdown(makeNote({ content: 'with newline\n' }));
    expect(md.endsWith('with newline\n\n')).toBe(false);
    expect(md.endsWith('with newline\n')).toBe(true);
  });
});

describe('parseNoteExport', () => {
  it('round-trips a JSON export back into a Note', () => {
    const note = makeNote();
    const json = exportNoteAsJson(note, { appVersion: '0.6.7', now: NOTE_FIXED_DATE });
    const parsed = parseNoteExport(json);
    expect(parsed).not.toBeNull();
    expect(parsed!.id).toBe(note.id);
    expect(parsed!.title).toBe(note.title);
    expect(parsed!.content).toBe(note.content);
    expect(parsed!.createdAt).toBe(note.createdAt);
    expect(parsed!.updatedAt).toBe(note.updatedAt);
    expect(parsed!.tags).toEqual(note.tags);
  });

  it('returns null for invalid JSON', () => {
    expect(parseNoteExport('not json')).toBeNull();
  });

  it('returns null for an unrelated object', () => {
    expect(parseNoteExport('{"foo":"bar"}')).toBeNull();
  });

  it('returns null when the version is missing or wrong', () => {
    expect(parseNoteExport(JSON.stringify({ note: { id: 'x' } }))).toBeNull();
    expect(parseNoteExport(JSON.stringify({ version: 2, note: { id: 'x' } }))).toBeNull();
  });

  it('returns null when the note envelope is malformed', () => {
    const bad = {
      version: 1,
      exportedAt: '2026-08-03T00:00:00.000Z',
      appVersion: '0.6.7',
      note: { id: 'x' }, // missing title/content/dates
    };
    expect(parseNoteExport(JSON.stringify(bad))).toBeNull();
  });

  it('round-trip is deterministic for the note body (exportedAt is excluded from the Note)', () => {
    const note = makeNote();
    const a = parseNoteExport(
      exportNoteAsJson(note, { appVersion: '0.6.7', now: NOTE_FIXED_DATE }),
    )!;
    const b = parseNoteExport(
      exportNoteAsJson(note, { appVersion: '0.6.7', now: NOTE_FIXED_DATE }),
    )!;
    expect(a).toEqual(b);
  });
});
