// SPDX-License-Identifier: Apache-2.0
/**
 * Notes full-text search (R193).
 *
 * Pure functions — no store, no DOM, no Svelte. The notes view calls
 * `searchNotes($sortedNotes, query)` inside a `$derived` and renders the
 * result. Mirrors the R178 `settingsSearch` 6-level pattern (exact /
 * prefix / word-boundary / substring / fuzzy / tag) but tuned for notes:
 *   - tag matches at level 300 (between word-boundary 250 and prefix 500)
 *   - empty query returns the input array as-is (preserves upstream sort)
 *   - tiebreak: updatedAt desc, then createdAt desc
 *   - max 100 results (defensive — never infinite)
 *
 * Diacritic-fold: "cafe" matches "café note". Cyrillic-safe: "встреча"
 * matches "встреча с командой". Case-insensitive: "Rust" matches "rust".
 */

import type { Note } from './notesBacklinks';
import { extractTags } from './notesBacklinks';

/** 6-level match scores. Higher = better. */
export const SCORE = {
  EXACT: 1000,
  PREFIX: 500,
  TAG: 300,
  WORD_BOUNDARY: 250,
  SUBSTRING: 100,
  FUZZY: 50,
} as const;

export type MatchedField = 'title' | 'content' | 'tag';

/** Cap the result set. Defensive — never infinite. */
export const MAX_RESULTS = 100;

/**
 * Normalize a search query:
 *   - lowercase
 *   - trim + collapse whitespace
 *   - strip diacritics (NFD-decompose + drop combining marks)
 *   - empty / nullish → ""
 */
export function normalizeQuery(s: string): string {
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** True if `needle` matches as a whole word inside `haystack`. */
function hasWordBoundary(haystack: string, needle: string): boolean {
  if (!needle) return false;
  let from = 0;
  while (from <= haystack.length) {
    const idx = haystack.indexOf(needle, from);
    if (idx < 0) return false;
    const before = idx === 0 ? '' : haystack[idx - 1];
    const after =
      idx + needle.length >= haystack.length ? '' : haystack[idx + needle.length];
    const isWord = (ch: string): boolean => /[A-Za-z0-9_\u0400-\u04FF]/.test(ch);
    if (!isWord(before) && !isWord(after)) return true;
    from = idx + 1;
  }
  return false;
}

/** Levenshtein distance (iterative, two-row). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** Max Levenshtein distance allowed for a fuzzy match. */
function fuzzyAllowedDistance(query: string): number {
  if (query.length >= 4) return 2;
  if (query.length >= 2) return 1;
  return 0;
}

/** True if any whitespace-/punctuation-separated word in `haystack` is within
 *  the allowed edit distance of `query`. */
function hasFuzzyMatch(haystack: string, query: string): boolean {
  const maxDist = fuzzyAllowedDistance(query);
  if (maxDist === 0) return false;
  // Split on any non-word char (incl. ASCII + Cyrillic).
  const tokens = haystack.split(/[^\p{L}\p{N}_]+/u).filter(Boolean);
  for (const tok of tokens) {
    if (Math.abs(tok.length - query.length) > maxDist) continue;
    if (levenshtein(tok, query) <= maxDist) return true;
  }
  return false;
}

interface FieldHit {
  score: number;
  field: MatchedField;
}

/** Score a single haystack against the query. */
function scoreHaystack(
  haystack: string,
  query: string,
  field: MatchedField,
): FieldHit | null {
  if (!haystack) return null;
  const h = normalizeQuery(haystack);
  const q = query; // already normalized by caller
  if (!q) return null;
  if (h === q) return { score: SCORE.EXACT, field };
  if (h.startsWith(q)) return { score: SCORE.PREFIX, field };
  // First word prefix (catches "Rust tutorial" when query="rust")
  const firstWordEnd = h.search(/[^\p{L}\p{N}_]/u);
  const firstWord = firstWordEnd < 0 ? h : h.slice(0, firstWordEnd);
  if (firstWord.startsWith(q)) return { score: SCORE.PREFIX, field };
  if (hasWordBoundary(h, q)) return { score: SCORE.WORD_BOUNDARY, field };
  if (h.includes(q)) return { score: SCORE.SUBSTRING, field };
  if (hasFuzzyMatch(h, q)) return { score: SCORE.FUZZY, field };
  return null;
}

interface Scored {
  note: Note;
  score: number;
  field: MatchedField;
}

/** Union of `note.tags` and tags extracted from content. */
function getNoteTags(note: Note): Set<string> {
  const out = new Set<string>();
  if (note.tags) for (const t of note.tags) out.add(t);
  for (const t of extractTags(note.content ?? '')) out.add(t);
  return out;
}

/** Best hit across title / content / tag fields for a single normalized query. */
function bestHit(note: Note, q: string): FieldHit | null {
  const hits: FieldHit[] = [];
  const titleHit = scoreHaystack(note.title ?? '', q, 'title');
  if (titleHit) hits.push(titleHit);
  const contentHit = scoreHaystack(note.content ?? '', q, 'content');
  if (contentHit) hits.push(contentHit);
  for (const tag of getNoteTags(note)) {
    if (scoreHaystack(tag, q, 'tag')) {
      hits.push({ score: SCORE.TAG, field: 'tag' });
      break;
    }
  }
  if (hits.length === 0) return null;
  hits.sort((a, b) => b.score - a.score);
  return hits[0];
}

/** Score one note. Whole-query hit wins. Multi-token queries fall back to
 *  per-token AND matching: every token must hit somewhere; the note's score
 *  is the max of all token hits. */
function scoreNote(note: Note, q: string, tokens: string[]): Scored | null {
  const whole = bestHit(note, q);
  if (whole) return { note, score: whole.score, field: whole.field };
  if (tokens.length <= 1) return null;
  let tokenMax = 0;
  for (const tok of tokens) {
    const h = bestHit(note, tok);
    if (!h) return null;
    if (h.score > tokenMax) tokenMax = h.score;
  }
  return { note, score: tokenMax, field: 'content' };
}

/**
 * Search notes by title + content + tags. Empty / whitespace-only query
 * returns the input array unchanged (preserves the upstream sort, e.g.
 * `sortedNotes` updatedAt desc). Otherwise ranks by 6-level score with
 * updatedAt / createdAt tiebreak and caps at `MAX_RESULTS` (100).
 *
 * Multi-word queries: split on whitespace. If the whole phrase doesn't
 * match at any level, the note still matches when every token matches
 * somewhere (AND). Per-token scores are aggregated by max.
 */
export function searchNotes(notes: Note[], query: string): Note[] {
  const q = normalizeQuery(query);
  if (!q) return notes;
  const tokens = q.split(' ').filter(Boolean);

  const scored: Scored[] = [];
  for (const note of notes) {
    const r = scoreNote(note, q, tokens);
    if (r) scored.push(r);
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.note.updatedAt !== a.note.updatedAt) return b.note.updatedAt - a.note.updatedAt;
    return b.note.createdAt - a.note.createdAt;
  });

  return scored.slice(0, MAX_RESULTS).map((s) => s.note);
}

/**
 * Test/internal: returns the best match score + field for a single note.
 * Used to verify the 6-level ranking in tests without re-deriving the
 * full ranking. Exported for the test suite.
 */
export function scoreNoteForTest(
  note: Note,
  query: string,
): { score: number; field: MatchedField } | null {
  const q = normalizeQuery(query);
  if (!q) return null;
  const h = bestHit(note, q);
  if (!h) return null;
  return { score: h.score, field: h.field };
}
