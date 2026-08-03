// SPDX-License-Identifier: Apache-2.0
/**
 * Pure fuzzy matcher for the settings search overlay (R178).
 *
 * Scoring tiers (first match wins, score is the first tier that fires):
 *   1. exact title  (case-insensitive)         → 1000
 *   2. title prefix                            →  500
 *   3. title word-boundary prefix              →  250
 *   4. title substring                         →  100
 *   5. keyword exact OR prefix                 →   50
 *   6. keyword substring                       →   10
 *   7. no match                                → excluded
 *
 * Empty query returns every entry with score 0 in registry order
 * (the caller can use this for the "browse" mode when the input is
 * blank).
 *
 * The matcher is deliberately pure: no DOM, no `window`, no I/O. This
 * keeps the unit tests trivial (`expect(searchSettings('the', …).length).toBeGreaterThan(0)`)
 * and lets us share the algorithm with the desktop build in a future
 * R-round.
 */
import type { SettingEntry } from './settingsRegistry';

export type MatchedField = 'title' | 'keyword';

export interface MatchedEntry extends SettingEntry {
  /** Higher is better. 0 means "no match"; only used for empty-query pass-through. */
  score: number;
  matchedField: MatchedField;
}

/** Trim + collapse internal whitespace. Cyrillic + Latin both survive. */
export function normalizeQuery(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** Lowercase, no diacritics folded (we keep Cyrillic intact — the app is bilingual). */
function lc(s: string): string {
  return s.toLowerCase();
}

/** Does any whitespace-delimited word in `haystack` start with `needle`? */
function anyWordStartsWith(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const words = haystack.split(/\s+/);
  for (const w of words) {
    if (w.startsWith(needle)) return true;
  }
  return false;
}

/**
 * Score one entry against one normalized query. Returns 0 on miss.
 * `matchedField` is set to the field that produced the (first) winning
 * score — useful for UI badges ("Matched: title" vs "Matched: keyword").
 */
export function scoreEntry(
  entry: SettingEntry,
  query: string,
): { score: number; matchedField: MatchedField } {
  if (!query) return { score: 0, matchedField: 'title' };

  const title = lc(entry.title);
  const q = lc(query);

  // 1. exact title
  if (title === q) return { score: 1000, matchedField: 'title' };

  // 2. title prefix
  if (title.startsWith(q)) return { score: 500, matchedField: 'title' };

  // 3. word-boundary on title
  if (anyWordStartsWith(title, q)) return { score: 250, matchedField: 'title' };

  // 4. substring on title
  if (title.includes(q)) return { score: 100, matchedField: 'title' };

  // 5/6. keywords
  for (const rawKw of entry.keywords) {
    const kw = lc(rawKw);
    if (kw === q || kw.startsWith(q)) {
      return { score: 50, matchedField: 'keyword' };
    }
    if (kw.includes(q)) {
      return { score: 10, matchedField: 'keyword' };
    }
  }

  return { score: 0, matchedField: 'title' };
}

/**
 * Public API: filter + score the registry.
 * Result is sorted by score DESC, then by registry order (stable).
 * Entries with score 0 are dropped.
 */
export function searchSettings(
  query: string,
  entries: readonly SettingEntry[],
): MatchedEntry[] {
  const q = normalizeQuery(query);

  // Empty query → pass-through in registry order, score 0.
  if (!q) {
    return entries.map((entry) => ({ ...entry, score: 0, matchedField: 'title' as const }));
  }

  const out: MatchedEntry[] = [];
  for (const entry of entries) {
    const { score, matchedField } = scoreEntry(entry, q);
    if (score > 0) {
      out.push({ ...entry, score, matchedField });
    }
  }
  // Stable sort: higher score first. JS Array.sort is stable since ES2019
  // so registry order is preserved within a tied score.
  out.sort((a, b) => b.score - a.score);
  return out;
}
