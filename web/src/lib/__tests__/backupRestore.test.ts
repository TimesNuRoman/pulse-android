import { describe, it, expect } from 'vitest';
import type { Note } from '../notesBacklinks';
import {
  exportAllNotes,
  parseBackupFile,
  validateBackupFormat,
  mergeNotes,
  replaceNotes,
  previewMerge,
  buildBackupFilename,
  BACKUP_VERSION,
} from '../backupRestore';

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    title: 'Test note',
    content: '# Hello',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe('exportAllNotes', () => {
  it('produces a JSON string with the expected top-level shape', () => {
    const res = exportAllNotes([makeNote()], '0.6.7', new Date('2026-08-03T12:00:00.000Z'));
    const parsed = JSON.parse(res.json) as Record<string, unknown>;
    expect(parsed.version).toBe(BACKUP_VERSION);
    expect(parsed.appVersion).toBe('0.6.7');
    expect(parsed.exportedAt).toBe('2026-08-03T12:00:00.000Z');
    expect(Array.isArray(parsed.notes)).toBe(true);
    expect((parsed.notes as unknown[]).length).toBe(1);
  });

  it('emits the suggested filename in pulse-notes-backup-YYYY-MM-DD form', () => {
    const res = exportAllNotes([], '0.6.7', new Date('2026-08-03T12:00:00.000Z'));
    expect(res.filename).toBe('pulse-notes-backup-2026-08-03.json');
  });

  it('round-trips through parseBackupFile and validateBackupFormat', () => {
    const res = exportAllNotes([makeNote({ id: 'a' }), makeNote({ id: 'b' })], '0.6.7');
    const parsed = parseBackupFile(res.json);
    expect(parsed.notes.length).toBe(2);
    expect(validateBackupFormat(parsed)).toBe(true);
  });

  it('handles an empty notes array', () => {
    const res = exportAllNotes([], '0.6.7');
    const parsed = parseBackupFile(res.json);
    expect(parsed.notes).toEqual([]);
  });

  it('scales to 1000 notes without losing data', () => {
    const notes: Note[] = Array.from({ length: 1000 }, (_, i) =>
      makeNote({ id: `n${i}`, title: `Title ${i}`, content: `Body ${i}` }),
    );
    const res = exportAllNotes(notes, '0.6.7');
    const parsed = parseBackupFile(res.json);
    expect(parsed.notes.length).toBe(1000);
    expect(parsed.notes[0].id).toBe('n0');
    expect(parsed.notes[999].id).toBe('n999');
  });
});

describe('parseBackupFile / validateBackupFormat', () => {
  const validJson = exportAllNotes([makeNote()], '0.6.7').json;

  it('accepts a valid payload', () => {
    expect(validateBackupFormat(JSON.parse(validJson))).toBe(true);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseBackupFile('{not json')).toThrow(/Invalid JSON/);
  });

  it('rejects an unsupported version', () => {
    const bad = JSON.parse(validJson) as Record<string, unknown>;
    bad.version = 99;
    expect(validateBackupFormat(bad)).toBe(false);
    expect(() => parseBackupFile(JSON.stringify(bad))).toThrow();
  });

  it('rejects missing required string fields', () => {
    const bad = JSON.parse(validJson) as Record<string, unknown>;
    delete (bad as { exportedAt?: unknown }).exportedAt;
    expect(validateBackupFormat(bad)).toBe(false);
  });

  it('rejects notes with bad field types', () => {
    const bad = JSON.parse(validJson) as Record<string, unknown>;
    (bad.notes as Array<Record<string, unknown>>)[0].createdAt = 'not a number';
    expect(validateBackupFormat(bad)).toBe(false);
  });

  it('rejects non-object payloads', () => {
    expect(validateBackupFormat(null)).toBe(false);
    expect(validateBackupFormat('string')).toBe(false);
    expect(validateBackupFormat(42)).toBe(false);
    expect(validateBackupFormat([])).toBe(false);
  });
});

describe('mergeNotes', () => {
  it('keeps the imported note when its updatedAt is higher', () => {
    const existing: Note[] = [makeNote({ id: 'a', title: 'Old A', updatedAt: 100 })];
    const imported = [{ ...makeNote({ id: 'a', title: 'New A', updatedAt: 200 }) }];
    const merged = mergeNotes(existing, imported);
    expect(merged.length).toBe(1);
    expect(merged[0].title).toBe('New A');
  });

  it('keeps the existing note when its updatedAt is higher', () => {
    const existing: Note[] = [makeNote({ id: 'a', title: 'Existing', updatedAt: 200 })];
    const imported = [{ ...makeNote({ id: 'a', title: 'Stale', updatedAt: 100 }) }];
    const merged = mergeNotes(existing, imported);
    expect(merged.length).toBe(1);
    expect(merged[0].title).toBe('Existing');
  });

  it('adds notes that only exist in the imported set', () => {
    const existing: Note[] = [makeNote({ id: 'a' })];
    const imported = [makeNote({ id: 'b' })];
    const merged = mergeNotes(existing, imported);
    expect(merged.length).toBe(2);
    const ids = merged.map((n) => n.id).sort();
    expect(ids).toEqual(['a', 'b']);
  });

  it('keeps notes that only exist in the existing set', () => {
    const existing: Note[] = [makeNote({ id: 'a' }), makeNote({ id: 'b' })];
    const imported = [makeNote({ id: 'b' })]; // b is identical, no change
    const merged = mergeNotes(existing, imported);
    expect(merged.length).toBe(2);
  });
});

describe('replaceNotes', () => {
  it('discards notes that are not in the imported set', () => {
    const existing: Note[] = [makeNote({ id: 'a' }), makeNote({ id: 'b' })];
    const imported = [makeNote({ id: 'b', title: 'Replaced' })];
    const replaced = replaceNotes(existing, imported);
    expect(replaced.length).toBe(1);
    expect(replaced[0].id).toBe('b');
    expect(replaced[0].title).toBe('Replaced');
  });

  it('returns an empty list when imported is empty', () => {
    expect(replaceNotes([makeNote()], [])).toEqual([]);
  });
});

describe('previewMerge', () => {
  it('reports added / updated / unchanged counts', () => {
    const existing: Note[] = [
      makeNote({ id: 'a', updatedAt: 100 }),
      makeNote({ id: 'b', updatedAt: 200 }),
    ];
    const imported = [
      { ...makeNote({ id: 'a', updatedAt: 150 }) }, // updated
      { ...makeNote({ id: 'b', updatedAt: 100 }) }, // unchanged (stale)
      { ...makeNote({ id: 'c', updatedAt: 300 }) }, // added
    ];
    const diff = previewMerge(existing, imported);
    expect(diff.added).toBe(1);
    expect(diff.updated).toBe(1);
    expect(diff.unchanged).toBe(1);
  });
});

describe('buildBackupFilename', () => {
  it('pads single-digit months and days', () => {
    expect(buildBackupFilename(new Date('2026-01-05T00:00:00.000Z'))).toBe(
      'pulse-notes-backup-2026-01-05.json',
    );
  });
});
