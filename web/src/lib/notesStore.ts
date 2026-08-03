import { writable, derived, get, type Writable } from 'svelte/store';
import type { Note } from './notesBacklinks';
import { extractTags, buildBacklinkIndex, countTags } from './notesBacklinks';
// R167 — fire a `selection` tick after a successful create/delete so the
// user feels confirmation. The helper internally checks isHapticsEnabled()
// + prefers-reduced-motion, so this call is safe to add unconditionally.
import { hapticSelection } from './haptics';

const STORAGE_KEY = 'pulse.notes.v1';

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
    if (Array.isArray(parsed)) return parsed as Note[];
    return null;
  } catch {
    return null;
  }
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
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      store.update((notes) => [note, ...notes]);
      // R167 — confirmation tick after successful create. Fire-and-forget;
      // hapticSelection never throws and never awaits a plugin call site
      // (it short-circuits in test environments where window is undefined).
      void hapticSelection();
      return note;
    },
    update(id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'tags'>>): void {
      store.update((notes) =>
        notes.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n)),
      );
    },
    delete(id: string): void {
      store.update((notes) => notes.filter((n) => n.id !== id));
      // R167 — confirmation tick after successful delete.
      void hapticSelection();
    },
    resetToMocks(): void {
      store.set(MOCK_NOTES);
    },
  };
}

export const notesStore = createNotesStore();

export const sortedNotes = derived(notesStore, ($notes) =>
  [...$notes].sort((a, b) => b.updatedAt - a.updatedAt),
);

export const backlinkIndex = derived(notesStore, ($notes) => buildBacklinkIndex($notes));

export const tagCounts = derived(notesStore, ($notes) => countTags($notes));

export const allTags = derived(tagCounts, ($counts) => {
  const out: { tag: string; count: number }[] = [];
  $counts.forEach((count, tag) => out.push({ tag, count }));
  return out.sort((a, b) => b.count - a.count);
});
