import { writable, derived, get, type Writable } from 'svelte/store';
import type { Note, NoteColor } from './notesBacklinks';
import { extractTags, buildBacklinkIndex, countTags } from './notesBacklinks';
import { isValidNoteColor } from './noteColors';
import {
  archiveNote as archiveNotePure,
  restoreNote as restoreNotePure,
  getArchivedNotes as getArchivedNotesPure,
  getActiveNotes as getActiveNotesPure,
  emptyArchive as emptyArchivePure,
} from './notesArchive';
import { sortNotes } from './notesSort';
import { writeWidgetCache } from './widgetCache';
import { hapticSelection } from './haptics';

const STORAGE_KEY = 'pulse.notes.v1';

// R140 — user-set tag schema. Tags are stored in `Note.tags` (separate from
// body-extracted `#tag` patterns). Validation: lowercase, alphanumeric +
// dash, 1-32 chars, must start with [a-z0-9]. Hand-rolled (no deps).
export const TAG_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
export const MAX_TAG_LEN = 32;
export const MAX_TAGS_PER_NOTE = 20;

/**
 * Normalize a raw tag input to a valid tag, or return null if invalid.
 * - Strips leading `#`
 * - Trims whitespace
 * - Lowercases
 * - Validates against TAG_RE
 * - Returns null for empty / overlong / disallowed chars
 */
export function normalizeTag(raw: string): string | null {
  if (!raw) return null;
  let t = raw.trim();
  // Strip any leading `#` characters. A pasted `##idea` (mistype) still
  // resolves to `idea`. The user can never intentionally have a `#`
  // inside a valid tag per the schema.
  while (t.startsWith('#')) t = t.slice(1);
  t = t.trim().toLowerCase();
  if (!t) return null;
  if (t.length > MAX_TAG_LEN) return null;
  if (!TAG_RE.test(t)) return null;
  return t;
}

/**
 * Parse a free-form string (e.g. "work, urgent #idea") into a list of
 * normalized, deduplicated, valid tags. Order preserved, empty/invalid
 * entries silently dropped.
 */
export function parseTagInput(raw: string): string[] {
  if (!raw) return [];
  // Split on whitespace and commas; whitespace handles `#work #urgent`,
  // comma handles `work, urgent`.
  const parts = raw.split(/[\s,]+/).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const t = normalizeTag(p);
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

const now = Date.now();
const t = (offset: number): number => now - offset * 24 * 60 * 60 * 1000;

export const MOCK_NOTES: Note[] = [
  {
    id: 'n1',
    title: 'Welcome to Pulse Notes',
    content: `# Welcome to Pulse Notes

This is your first note. Try editing it — Pulse Notes uses **markdown** with custom extensions.

## Wikilinks
Link other notes with double brackets: [[Smart Engine v3]] or [[Roadmap]].

## Tags
Add tags anywhere with \`#tag-name\`. Try these:
#pulse #notes #v0-6-0

## Code
\`\`\`ts
const note = "hello";
console.log(note);
\`\`\`
`,
    tags: ['welcome', 'getting-started'],
    createdAt: t(7),
    updatedAt: t(1),
  },
  {
    id: 'n2',
    title: 'Smart Engine v3',
    content: `# Smart Engine v3

A/B test results: code-edit model gemma3:1b vs gemma3:4b.
- Pass rate: 88% vs 56% (+32pp)
- Latency p50: -1370ms
- Eval gate: 50 tasks

References: [[Welcome to Pulse Notes]], [[Roadmap]].
Tags: #smart-engine #a-b-test
`,
    tags: ['smart-engine', 'a-b-test', 'ml'],
    createdAt: t(6),
    updatedAt: t(0),
  },
  {
    id: 'n3',
    title: 'Roadmap',
    content: `# Roadmap

## v0.6.0
- Pulse Notes mobile (this app)
- Greenfield rewrite, MAJOR bump

## v0.7.0
- So1ana integration
- Native inference Phase 2

## v0.8.0
- Multi-device sync

See also: [[Smart Engine v3]], [[Welcome to Pulse Notes]].
Tags: #roadmap #planning
`,
    tags: ['roadmap', 'planning'],
    createdAt: t(5),
    updatedAt: t(2),
  },
  {
    id: 'n4',
    title: 'Bangkok prep',
    content: `# Bangkok prep

Things to handle before the move:
- [ ] Visa
- [ ] HRT consultation
- [ ] Apartment search
- [ ] Banking (LGT Wise)
- [ ] SIM card

Related: [[Roadmap]] #personal #bangkok #2026
`,
    tags: ['personal', 'bangkok', 'planning'],
    createdAt: t(4),
    updatedAt: t(3),
  },
  {
    id: 'n5',
    title: 'CodeMirror notes',
    content: `# CodeMirror 6 setup

\`\`\`ts
import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
\`\`\`

Touch-friendly: 16px font, no hover, 44dp tap targets.
Reference: [[Welcome to Pulse Notes]] #codemirror #editor
`,
    tags: ['codemirror', 'editor', 'mobile'],
    createdAt: t(3),
    updatedAt: t(0),
  },
  {
    id: 'n6',
    title: 'Pulse UI rules',
    content: `# Pulse UI rules

From the design directive (Roman, 2026-07-31):

- **Dark only** — no light theme
- Tokyo Night palette
- Material 3 toolbar pattern
- 44dp touch min, 48dp preferred
- WCAG AA 11.4:1 contrast
- No emoji in UI
- No marketing copy ("revolutionary", "amazing")

See: [[Welcome to Pulse Notes]] #design #ui-rules
`,
    tags: ['design', 'ui-rules'],
    createdAt: t(3),
    updatedAt: t(1),
  },
  {
    id: 'n7',
    title: 'Telegram bot mock',
    content: `# Telegram bot mock

3 mock notes for the wizard:
1. Саша — Таиланд trip
2. Мама — кран repair
3. Pavel — Pulse sync

These are the seed data for [[Welcome to Pulse Notes]] onboarding.
#telegram #mock
`,
    tags: ['telegram', 'mock'],
    createdAt: t(2),
    updatedAt: t(1),
  },
  {
    id: 'n8',
    title: 'Pratchett novel',
    content: `# Pratchett novel

Side project (post-Pulse, P3).

Twine/Ink or inkle. Solo + AI agents.
8-question brief first, then pitch, then prototype, then ship.

License unclear (original vs fanfic). Starting AFTER Pulse v0.7+.

Reference: [[Roadmap]] #side-project #writing
`,
    tags: ['side-project', 'writing'],
    createdAt: t(1),
    updatedAt: t(0),
  },
];

function loadFromStorage(): Note[] | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return migrateNotes(parsed);
    return null;
  } catch {
    return null;
  }
}

/**
 * R140 — non-destructive migration for notes loaded from storage.
 * Pre-R140 notes lack the `tags` field; default to `[]` so downstream
 * code can treat `tags` as a plain array. Body-extracted `#tag`
 * patterns stay untouched (those are a different concept).
 *
 * Exported so tests can verify the migration without re-creating the
 * store.
 */
export function migrateNotes(parsed: unknown[]): Note[] {
  return (parsed as Note[]).map((n) => ({
    ...n,
    tags: Array.isArray(n.tags) ? n.tags : [],
  }));
}

function saveToStorage(notes: Note[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch {
    // quota / privacy mode — ignore
  }
}

function createId(): string {
  return 'n' + Math.random().toString(36).slice(2, 10);
}

function createNotesStore() {
  const initial: Note[] = loadFromStorage() ?? MOCK_NOTES;
  const store: Writable<Note[]> = writable(initial);
  let firstSave = true;
  store.subscribe((notes) => {
    if (firstSave) {
      firstSave = false;
      return;
    }
    saveToStorage(notes);
  });

  // R173 — debounce widget cache writes. update() is called on every
  // keystroke; we don't want to hit disk at the same rate. 800ms keeps
  // the widget fresh enough after a typing burst without thrashing IO.
  let widgetCacheTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleWidgetCache(): void {
    if (widgetCacheTimer) clearTimeout(widgetCacheTimer);
    widgetCacheTimer = setTimeout(() => {
      widgetCacheTimer = null;
      void writeWidgetCache(get(store));
    }, 800);
  }

  return {
    subscribe: store.subscribe,
    list(): Note[] {
      // Defensive copy: callers should not mutate the store's internal array.
      return [...get(store)];
    },
    get(id: string): Note | undefined {
      return get(store).find((n) => n.id === id);
    },
    create(initialContent: string = ''): Note {
      const note: Note = {
        id: createId(),
        title: 'Untitled',
        content: initialContent,
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      store.update((notes) => [note, ...notes]);
      scheduleWidgetCache();
      // R167 — confirmation tick after successful create. Fire-and-forget;
      // hapticSelection never throws and never awaits a plugin call site
      // (it short-circuits in test environments where window is undefined).
      void hapticSelection();
      return note;
    },
    // R136 — wikilink stub. When the user taps a `[[Title]]` that doesn't
    // exist yet, the preview calls this to create a placeholder note whose
    // body back-references the source. Title is taken verbatim; we do not
    // reformat or auto-number collisions (the user can rename later).
    createStubNote(title: string, sourceNoteId: string): Note {
      const source = sourceNoteId ? this.get(sourceNoteId) : undefined;
      const sourceTitle = source?.title ?? 'this note';
      const note: Note = {
        id: createId(),
        title,
        content: `Created from [[${sourceTitle}]]\n\n`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      store.update((notes) => [note, ...notes]);
      return note;
    },
    update(id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'tags' | 'color'>>): void {
      store.update((notes) =>
        notes.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n)),
      );
      scheduleWidgetCache();
    },
    delete(id: string): void {
      store.update((notes) => notes.filter((n) => n.id !== id));
      scheduleWidgetCache();
      // R167 — confirmation tick after successful delete. Fire-and-forget.
      void hapticSelection();
    },
    /**
     * R196 — set the color tag on a note. Returns the updated note, or
     * undefined if no note with that id exists. Invalid color ids are
     * rejected as no-ops (defensive — localStorage is user editable, so
     * corrupt values must not crash the store). `null` explicitly clears
     * the color.
     */
    setColor(noteId: string, color: NoteColor | null): Note | undefined {
      // Reject invalid input early. We do NOT fall back to 'none' on
      // bad input — the caller is responsible for `null` to mean
      // "clear the color".
      if (color !== null && !isValidNoteColor(color)) return undefined;
      const nextColor: NoteColor | null = color === 'none' ? null : color;
      let updated: Note | undefined;
      store.update((notes) =>
        notes.map((n) => {
          if (n.id !== noteId) return n;
          updated = { ...n, color: nextColor, updatedAt: Date.now() };
          return updated;
        }),
      );
      return updated;
    },
    /**
     * R196 — selector. Returns every note whose color matches the given
     * id. 'none' returns notes with no color (color === null/undefined).
     */
    getNotesByColor(color: NoteColor): Note[] {
      const target = color === 'none' ? null : color;
      return get(store).filter((n) => {
        const noteColor = n.color ?? null;
        if (target === null) return noteColor === null;
        return noteColor === target;
      });
    },
    resetToMocks(): void {
      store.set(MOCK_NOTES);
      void writeWidgetCache(MOCK_NOTES);
    },
    /** R173 — flush pending widget cache write immediately (e.g. on app close). */
    flushWidgetCache(): void {
      if (widgetCacheTimer) {
        clearTimeout(widgetCacheTimer);
        widgetCacheTimer = null;
      }
      void writeWidgetCache(get(store));
    },
    /**
     * Archive a note (reversible delete). Returns the updated note, or
     * `undefined` if no note with `id` exists. Re-archive on an already
     * archived note is a no-op (idempotent — original timestamp preserved).
     */
    archiveNote(id: string, now?: number): Note | undefined {
      const before = get(store).find((n) => n.id === id);
      if (!before) return undefined;
      const updated = archiveNotePure(before, now);
      if (updated === before) return before; // no-op path
      store.update((notes) => notes.map((n) => (n.id === id ? updated : n)));
      return updated;
    },
    /**
     * Restore a note from the archive. Returns the updated note, or
     * `undefined` if no note with `id` exists. No-op if the note is
     * already active.
     */
    restoreNote(id: string): Note | undefined {
      const before = get(store).find((n) => n.id === id);
      if (!before) return undefined;
      const updated = restoreNotePure(before);
      if (updated === before) return before; // no-op path
      store.update((notes) => notes.map((n) => (n.id === id ? updated : n)));
      return updated;
    },
    /**
     * Return archived notes (defensive copy) sorted by `archivedAt` desc.
     */
    getArchivedNotes(): Note[] {
      return getArchivedNotesPure(get(store));
    },
    /**
     * Return active (non-archived) notes (defensive copy, original order).
     */
    getActiveNotes(): Note[] {
      return getActiveNotesPure(get(store));
    },
    /**
     * Permanently delete every archived note. Returns the notes that were
     * removed (useful for "undo" toasts in the future).
     */
    emptyArchive(): Note[] {
      const all = get(store);
      const removed = getArchivedNotesPure(all);
      if (removed.length === 0) return removed;
      const next = emptyArchivePure(all);
      store.set(next);
      return removed;
    },
    // R187 — pin/favorite. These set `pinnedAt` without touching
    // `updatedAt` (pinning is metadata, not a content edit, so it must
    // not reshuffle the unpinned section). Returns `true` if the note
    // was found, `false` if the id is unknown. The boolean lets the UI
    // fire its "no-op" haptic branch without an extra `get()`.
    pinNote(id: string): boolean {
      let found = false;
      store.update((notes) =>
        notes.map((n) => {
          if (n.id !== id) return n;
          found = true;
          return { ...n, pinnedAt: new Date().toISOString() };
        }),
      );
      return found;
    },
    unpinNote(id: string): boolean {
      let found = false;
      store.update((notes) =>
        notes.map((n) => {
          if (n.id !== id) return n;
          found = true;
          return { ...n, pinnedAt: null };
        }),
      );
      return found;
    },
    togglePin(id: string): boolean {
      const current = get(store).find((n) => n.id === id);
      if (!current) return false;
      return current.pinnedAt ? this.unpinNote(id) : this.pinNote(id);
    },
    /**
     * Replace the entire note set with the provided list. Used by the
     * backup/restore import flow (R152). The notes' ids, createdAt, and
     * updatedAt are preserved as-given so a merge-by-id round trip works
     * correctly.
     */
    replaceAll(next: Note[]): void {
      store.set(next.map((n) => ({ ...n })));
    },
    // R140 — user-set tag mutations. `tags` is a separate concept from
    // body-extracted `#tag` patterns (which stay read-only and live in
    // `allTags` / `tagCounts` derived from content). These methods mutate
    // the `note.tags` field. Validates via `parseTagInput` / `normalizeTag`.
    setTags(id: string, rawTags: string | string[]): void {
      const arr = Array.isArray(rawTags) ? rawTags : parseTagInput(rawTags);
      this.update(id, { tags: arr.slice(0, MAX_TAGS_PER_NOTE) });
    },
    addTag(id: string, tag: string): void {
      const normalized = normalizeTag(tag);
      if (!normalized) return;
      const note = this.get(id);
      if (!note) return;
      const current = note.tags ?? [];
      if (current.includes(normalized)) return;
      if (current.length >= MAX_TAGS_PER_NOTE) return;
      this.update(id, { tags: [...current, normalized] });
    },
    removeTag(id: string, tag: string): void {
      const note = this.get(id);
      if (!note) return;
      const current = note.tags ?? [];
      const next = current.filter((t) => t !== tag);
      if (next.length === current.length) return;
      this.update(id, { tags: next });
    },
    /**
     * List every tag that appears in any note's `tags` field, with usage
     * counts. Sorted by count desc, then alphabetically. Tags with count
     * 0 are excluded.
     */
    listAllTags(): { tag: string; count: number }[] {
      const counts = new Map<string, number>();
      for (const n of get(store)) {
        for (const t of n.tags ?? []) {
          counts.set(t, (counts.get(t) ?? 0) + 1);
        }
      }
      const out: { tag: string; count: number }[] = [];
      counts.forEach((count, tag) => out.push({ tag, count }));
      return out.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
    },
    /**
     * Return notes that have any of the given tags in their `tags` field.
     * Empty `selectedTags` returns all notes (no filter).
     */
    filterByTags(selectedTags: string[]): Note[] {
      if (!selectedTags || selectedTags.length === 0) return [...get(store)];
      const set = new Set(selectedTags);
      return get(store).filter((n) => {
        const tags = n.tags ?? [];
        for (const t of tags) {
          if (set.has(t)) return true;
        }
        return false;
      });
    },
  };
}

export const notesStore = createNotesStore();

// R187 — sortedNotes now respects pin state via sortNotes(): pinned
// notes first (by pinnedAt desc), then unpinned (by updatedAt desc).
export const sortedNotes = derived(notesStore, ($notes) => sortNotes($notes));

// R202 + R187 — activeSortedNotes filters out archived notes (R202), then
// applies the pin-aware sort (R187). Pinned active notes float to the
// top; archived notes are hidden from the main list.
export const activeSortedNotes = derived(notesStore, ($notes) =>
  sortNotes(getActiveNotesPure($notes)),
);

export const archivedSortedNotes = derived(notesStore, ($notes) =>
  getArchivedNotesPure($notes),
);

// Re-export the pure helpers so consumers can `import` from `notesStore`
// without a second import path.
export { isArchived } from './notesArchive';

export const backlinkIndex = derived(notesStore, ($notes) => buildBacklinkIndex($notes));

export const tagCounts = derived(notesStore, ($notes) => countTags($notes));

export const allTags = derived(tagCounts, ($counts) => {
  const out: { tag: string; count: number }[] = [];
  $counts.forEach((count, tag) => out.push({ tag, count }));
  return out.sort((a, b) => b.count - a.count);
});

// R140 — derived store for the TagFilterBar. Counts come from the
// `note.tags` field (user-set, validated). This is the "filter bar"
// source of truth, distinct from `allTags` which reads body-extracted
// `#tag` patterns.
export const noteTagsList = derived(notesStore, ($notes) => {
  const counts = new Map<string, number>();
  for (const n of $notes) {
    for (const t of n.tags ?? []) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  const out: { tag: string; count: number }[] = [];
  counts.forEach((count, tag) => out.push({ tag, count }));
  return out.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
});
