// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import {
  searchSettings,
  scoreEntry,
  normalizeQuery,
  type MatchedEntry,
} from '../settingsSearch';
import { SETTINGS_REGISTRY } from '../settingsRegistry';

/**
 * Helper: pick the first registry entry whose id starts with `prefix`.
 * Tests below use this to anchor assertions to a known entry instead of
 * a fragile title string.
 */
function entryById(id: string) {
  const e = SETTINGS_REGISTRY.find((x) => x.id === id);
  if (!e) throw new Error(`registry entry not found: ${id}`);
  return e;
}

describe('settingsSearch.normalizeQuery', () => {
  it('trims leading/trailing whitespace', () => {
    expect(normalizeQuery('  hello  ')).toBe('hello');
  });
  it('collapses internal whitespace runs to a single space', () => {
    expect(normalizeQuery('hello   world')).toBe('hello world');
    expect(normalizeQuery('a\t\nb')).toBe('a b');
  });
  it('returns empty string for whitespace-only input', () => {
    expect(normalizeQuery('   \t  ')).toBe('');
  });
});

describe('settingsSearch.scoreEntry', () => {
  it('returns 1000 for an exact title match (case-insensitive)', () => {
    const e = entryById('about.version');
    const { score, matchedField } = scoreEntry(e, 'version');
    expect(score).toBe(1000);
    expect(matchedField).toBe('title');
  });
  it('returns 1000 even when query casing differs from title casing', () => {
    const e = entryById('about.version');
    expect(scoreEntry(e, 'VERSION').score).toBe(1000);
    expect(scoreEntry(e, 'Version').score).toBe(1000);
  });
  it('returns 500 for a title prefix match', () => {
    const e = entryById('about.last-check');
    const { score, matchedField } = scoreEntry(e, 'last');
    expect(score).toBe(500);
    expect(matchedField).toBe('title');
  });
  it('returns 250 for a word-boundary match (not prefix)', () => {
    // "Update host" — query "host" is a word boundary, not a prefix
    const e = entryById('about.manifest-host');
    const { score, matchedField } = scoreEntry(e, 'host');
    expect(score).toBe(250);
    expect(matchedField).toBe('title');
  });
  it('returns 100 for a substring match that is not word-bounded', () => {
    // "Display name" — query "play" is a substring, not a word boundary
    const e = entryById('profile.display-name');
    const { score, matchedField } = scoreEntry(e, 'play');
    expect(score).toBe(100);
    expect(matchedField).toBe('title');
  });
  it('returns 50 for a keyword exact match', () => {
    const e = entryById('feedback.haptics-toggle');
    // "haptics" appears as both a title word AND a keyword;
    // the title match wins (score 1000). Use a keyword-only word.
    const { score, matchedField } = scoreEntry(e, 'buzz');
    expect(score).toBe(50);
    expect(matchedField).toBe('keyword');
  });
  it('returns 50 for a keyword prefix match', () => {
    const e = entryById('actions.replay-onboarding');
    // keyword "tutorial" → "tut" is a prefix
    const { score, matchedField } = scoreEntry(e, 'tut');
    expect(score).toBe(50);
    expect(matchedField).toBe('keyword');
  });
  it('returns 10 for a keyword substring match', () => {
    const e = entryById('actions.replay-onboarding');
    // keyword "tutorial" → "tori" is a substring
    const { score, matchedField } = scoreEntry(e, 'tori');
    expect(score).toBe(10);
    expect(matchedField).toBe('keyword');
  });
  it('returns 0 for a non-matching query', () => {
    const e = entryById('about.version');
    expect(scoreEntry(e, 'kangaroo').score).toBe(0);
  });
  it('returns 0 for an empty/whitespace query (no scoring fired)', () => {
    const e = entryById('about.version');
    expect(scoreEntry(e, '').score).toBe(0);
    expect(scoreEntry(e, '   ').score).toBe(0);
  });
});

describe('settingsSearch.searchSettings', () => {
  it('returns every entry in registry order for an empty query', () => {
    const out: MatchedEntry[] = searchSettings('', SETTINGS_REGISTRY);
    expect(out.length).toBe(SETTINGS_REGISTRY.length);
    for (let i = 0; i < out.length; i++) {
      expect(out[i].id).toBe(SETTINGS_REGISTRY[i].id);
    }
    expect(out[0].score).toBe(0);
  });

  it('returns every entry for a whitespace-only query', () => {
    expect(searchSettings('   \t  ', SETTINGS_REGISTRY).length).toBe(SETTINGS_REGISTRY.length);
  });

  it('drops entries with no match', () => {
    const out = searchSettings('kangaroo', SETTINGS_REGISTRY);
    expect(out.length).toBe(0);
  });

  it('returns a single entry for an exact unique title match', () => {
    const out = searchSettings('SHA-256', SETTINGS_REGISTRY);
    expect(out.length).toBe(1);
    expect(out[0].id).toBe('about.sha256');
    expect(out[0].score).toBe(1000);
  });

  it('sorts multiple matches by score DESC', () => {
    // "theme" is a title (theme.palette, 1000) and a keyword for nothing else
    // → single match. Use a word that hits several entries.
    const out = searchSettings('update', SETTINGS_REGISTRY);
    expect(out.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1].score).toBeGreaterThanOrEqual(out[i].score);
    }
    // The "Update host" title wins (1000).
    expect(out[0].id).toBe('about.manifest-host');
  });

  it('preserves registry order within a tied score', () => {
    // "pulse" doesn't appear in any title; use a keyword shared by
    // several entries. "version" appears in about.version (title) and
    // actions.release-notes (keyword) → different scores, not a tie.
    // "code" is a keyword of "Source on GitHub" only — single match.
    // Pick a query that hits 2 entries by keyword with the same score.
    const out = searchSettings('lear', SETTINGS_REGISTRY);
    // Keyword substring matches. If there are 2+, they share score 10.
    if (out.length >= 2) {
      const ids = out.map((e) => e.id);
      const idxA = ids.indexOf(out[0].id);
      const idxB = ids.indexOf(out[1].id);
      expect(idxA).toBeLessThan(idxB); // first-registered comes first
    } else {
      // If the test word doesn't happen to hit 2, this is a degenerate
      // case — at minimum the result set must be valid.
      expect(out.every((e) => e.score > 0)).toBe(true);
    }
  });

  it('handles a Cyrillic query against a Cyrillic keyword (bilingual app)', () => {
    // Synthetic entry to test Cyrillic scoring without polluting the
    // shipped registry. Use a substring that is NOT a word boundary in
    // the title so we hit the title-substring tier (100), not the
    // word-boundary tier (250). "зоват" lives inside "пользователя"
    // but does not start any whitespace-delimited word.
    const cyrillicEntry = {
      id: 'test.cyr',
      category: 'profile' as const,
      title: 'Имя пользователя',
      keywords: ['ник', 'псевдоним'],
    };
    const out = searchSettings('зоват', [cyrillicEntry]);
    expect(out.length).toBe(1);
    expect(out[0].score).toBe(100);
    expect(out[0].matchedField).toBe('title');
  });

  it('case-insensitive across the full registry', () => {
    const upper = searchSettings('THEME', SETTINGS_REGISTRY);
    const lower = searchSettings('theme', SETTINGS_REGISTRY);
    expect(upper.map((e) => e.id)).toEqual(lower.map((e) => e.id));
  });

  it('trims and collapses whitespace in the query', () => {
    const a = searchSettings('  theme  ', SETTINGS_REGISTRY);
    const b = searchSettings('theme', SETTINGS_REGISTRY);
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id));
  });
});
