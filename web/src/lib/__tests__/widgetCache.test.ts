// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { writeWidgetCache, buildWidgetPayload } from '../widgetCache';
import type { Note } from '../notesBacklinks';

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'n',
    title: 'T',
    content: 'C',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

interface CapacitorMock {
  Capacitor?: { Plugins?: Record<string, unknown> };
}

function setFilesystemMock(impl: {
  writeFile?: (opts: unknown) => Promise<unknown>;
  readFile?: (opts: unknown) => Promise<{ data?: string }>;
}): void {
  (window as unknown as CapacitorMock).Capacitor = {
    Plugins: { Filesystem: impl },
  };
}

function clearFilesystemMock(): void {
  delete (window as unknown as CapacitorMock).Capacitor;
}

describe('widgetCache', () => {
  beforeEach(() => {
    clearFilesystemMock();
  });

  describe('buildWidgetPayload', () => {
    it('returns up to 3 notes, most recent first', () => {
      const notes: Note[] = [
        makeNote({ id: 'old', title: 'old', updatedAt: 100 }),
        makeNote({ id: 'mid', title: 'mid', updatedAt: 200 }),
        makeNote({ id: 'new', title: 'new', updatedAt: 300 }),
        makeNote({ id: 'newer', title: 'newer', updatedAt: 400 }),
      ];
      const out = buildWidgetPayload(notes);
      expect(out.map((n) => n.id)).toEqual(['newer', 'new', 'mid']);
    });

    it('truncates preview to 80 characters and flattens whitespace', () => {
      const notes: Note[] = [
        makeNote({
          id: 'big',
          title: 'big',
          content: 'a'.repeat(50) + '\n\n   ' + 'b'.repeat(60),
        }),
      ];
      const out = buildWidgetPayload(notes);
      expect(out[0].preview.length).toBe(80);
      expect(out[0].preview.includes('\n')).toBe(false);
    });

    it('falls back to "Untitled" when title is empty', () => {
      const out = buildWidgetPayload([makeNote({ id: 'x', title: '' })]);
      expect(out[0].title).toBe('Untitled');
    });
  });

  describe('writeWidgetCache', () => {
    it('writes top 3 notes by updatedAt desc to widget-cache.json under DOCUMENTS', async () => {
      const writeFile = vi.fn().mockResolvedValue(undefined);
      setFilesystemMock({ writeFile });

      const notes: Note[] = [
        makeNote({ id: 'a', title: 'A', updatedAt: 1 }),
        makeNote({ id: 'b', title: 'B', updatedAt: 2 }),
        makeNote({ id: 'c', title: 'C', updatedAt: 3 }),
        makeNote({ id: 'd', title: 'D', updatedAt: 4 }),
      ];

      await writeWidgetCache(notes);

      expect(writeFile).toHaveBeenCalledTimes(1);
      const args = writeFile.mock.calls[0][0] as {
        path: string;
        data: string;
        directory: string;
        recursive: boolean;
      };
      expect(args.path).toBe('widget-cache.json');
      expect(args.directory).toBe('DOCUMENTS');
      expect(args.recursive).toBe(false);
      const parsed = JSON.parse(args.data) as { id: string }[];
      expect(parsed.map((n) => n.id)).toEqual(['d', 'c', 'b']);
    });

    it('writes an empty array when no notes exist', async () => {
      const writeFile = vi.fn().mockResolvedValue(undefined);
      setFilesystemMock({ writeFile });

      await writeWidgetCache([]);

      expect(writeFile).toHaveBeenCalledTimes(1);
      const args = writeFile.mock.calls[0][0] as { data: string };
      expect(JSON.parse(args.data)).toEqual([]);
    });

    it('is a silent no-op when the Filesystem plugin is unavailable', async () => {
      const writeFile = vi.fn().mockResolvedValue(undefined);
      setFilesystemMock({}); // no writeFile
      await writeWidgetCache([makeNote()]);
      expect(writeFile).not.toHaveBeenCalled();
    });

    it('swallows writeFile errors so note saves never break', async () => {
      const writeFile = vi.fn().mockRejectedValue(new Error('disk full'));
      setFilesystemMock({ writeFile });
      // Must not throw.
      await expect(writeWidgetCache([makeNote()])).resolves.toBeUndefined();
    });
  });
});
