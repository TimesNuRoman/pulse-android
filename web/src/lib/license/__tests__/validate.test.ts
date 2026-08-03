// SPDX-License-Identifier: Apache-2.0
// Tests for license key format validation (R199 license foundation).
//
// Pure logic. No DOM, no Capacitor. Run via `npm test`.

import { describe, test, expect } from 'vitest';
import {
  validateKey,
  normalizeKey,
  groupKey,
  isAllowedBase32Char,
  TEST_KEY,
} from '../validate';

describe('validateKey - happy path', () => {
  test('accepts canonical 5-group production key', () => {
    const r = validateKey('PULSE-7YHK-DN9Q-XV5B-WM4Z-ABCD');
    expect(r.valid).toBe(true);
    expect(r.tier).toBe('pro');
    expect(r.error).toBeUndefined();
  });

  test('accepts hardcoded test key', () => {
    const r = validateKey(TEST_KEY);
    expect(r.valid).toBe(true);
    expect(r.tier).toBe('pro');
  });

  test('accepts lowercase input (normalized to upper)', () => {
    const r = validateKey('pulse-aaaa-bbbb-cccc-dddd-eeee');
    expect(r.valid).toBe(true);
    expect(r.tier).toBe('pro');
  });

  test('accepts input with extra whitespace (trimmed)', () => {
    const r = validateKey('  PULSE-AAAA-BBBB-CCCC-DDDD-EEEE  ');
    expect(r.valid).toBe(true);
    expect(r.tier).toBe('pro');
  });

  test('rejects space-separated input (simple normalize does not re-chunk)', () => {
    // Brief's normalizeKey is `trim + upper + strip whitespace` only.
    // It does NOT re-insert dashes. Desktop does (R191) - R200 can swap
    // to the desktop impl if paste forgiveness matters on Android.
    const r = validateKey('PULSE AAAA BBBB CCCC DDDD EEEE');
    expect(r.valid).toBe(false);
    expect(r.error).toBe('format');
  });

  test('accepts a key that uses digits 2-7 and 9', () => {
    // 2-9 are valid base32; only 0 and 1 are excluded
    const r = validateKey('PULSE-2345-6789-9ABC-DEF2-3GH4');
    expect(r.valid).toBe(true);
    expect(r.tier).toBe('pro');
  });
});

describe('validateKey - empty input', () => {
  test('rejects empty string', () => {
    const r = validateKey('');
    expect(r.valid).toBe(false);
    expect(r.tier).toBe('free');
    expect(r.error).toBe('empty');
  });

  test('rejects whitespace-only input', () => {
    const r = validateKey('   ');
    expect(r.valid).toBe(false);
    expect(r.tier).toBe('free');
    expect(r.error).toBe('empty');
  });
});

describe('validateKey - format errors', () => {
  test('rejects key with too few groups (4 groups)', () => {
    const r = validateKey('PULSE-AAAA-BBBB-CCCC-DDDD');
    expect(r.valid).toBe(false);
    expect(r.tier).toBe('free');
    expect(r.error).toBe('format');
  });

  test('rejects key with too many groups (6 groups)', () => {
    const r = validateKey('PULSE-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF');
    expect(r.valid).toBe(false);
    expect(r.tier).toBe('free');
    expect(r.error).toBe('format');
  });

  test('rejects key with forbidden char 0', () => {
    const r = validateKey('PULSE-0ABC-DEFG-HIJK-LMNO-PQRS');
    expect(r.valid).toBe(false);
    expect(r.tier).toBe('free');
    expect(r.error).toBe('format');
  });

  test('rejects key with forbidden char O', () => {
    const r = validateKey('PULSE-OABC-DEFG-HIJK-LMNO-PQRS');
    expect(r.valid).toBe(false);
    expect(r.error).toBe('format');
  });

  test('rejects key with forbidden char 1', () => {
    const r = validateKey('PULSE-1ABC-DEFG-HIJK-LMNO-PQRS');
    expect(r.valid).toBe(false);
    expect(r.error).toBe('format');
  });

  test('rejects key with forbidden char I', () => {
    const r = validateKey('PULSE-IABC-DEFG-HIJK-LMNO-PQRS');
    expect(r.valid).toBe(false);
    expect(r.error).toBe('format');
  });

  test('rejects key with forbidden char L', () => {
    const r = validateKey('PULSE-LABC-DEFG-HIJK-LMNO-PQRS');
    expect(r.valid).toBe(false);
    expect(r.error).toBe('format');
  });

  test('rejects key without PULSE- prefix', () => {
    const r = validateKey('XXXX-AAAA-BBBB-CCCC-DDDD-EEEE');
    expect(r.valid).toBe(false);
    expect(r.error).toBe('format');
  });

  test('rejects completely garbage', () => {
    const r = validateKey('garbage');
    expect(r.valid).toBe(false);
    expect(r.error).toBe('format');
  });

  test('rejects key with chunk shorter than 4 chars', () => {
    const r = validateKey('PULSE-ABC-DEFG-HIJK-LMNO-PQRS');
    expect(r.valid).toBe(false);
    expect(r.error).toBe('format');
  });
});

describe('normalizeKey', () => {
  test('lowercases to uppercase', () => {
    expect(normalizeKey('pulse-aaaa-bbbb-cccc-dddd-eeee')).toBe(
      'PULSE-AAAA-BBBB-CCCC-DDDD-EEEE',
    );
  });

  test('trims leading and trailing whitespace', () => {
    expect(normalizeKey('   PULSE-AAAA-BBBB-CCCC-DDDD-EEEE   ')).toBe(
      'PULSE-AAAA-BBBB-CCCC-DDDD-EEEE',
    );
  });

  test('strips internal whitespace (no re-chunking per R199 brief)', () => {
    // Brief normalize is intentionally simple: trim + upper + strip ws.
    // Caller is responsible for canonical 5-group form. See validate.ts
    // JSDoc for the desktop vs android tradeoff.
    expect(normalizeKey('PULSE AAAA BBBB CCCC DDDD EEEE')).toBe(
      'PULSEAAAABBBBCCCCDDDDEEEE',
    );
  });

  test('returns empty for empty input', () => {
    expect(normalizeKey('')).toBe('');
  });

  test('returns empty for whitespace-only input', () => {
    expect(normalizeKey('   ')).toBe('');
  });

  test('keeps dashes (caller relies on them for chunking)', () => {
    expect(normalizeKey('pulse-aaaa-bbbb-cccc-dddd-eeee')).toContain('-');
    expect(normalizeKey('pulse-aaaa-bbbb-cccc-dddd-eeee').split('-')).toHaveLength(6);
  });
});

describe('groupKey', () => {
  test('returns 5 chunks for valid key', () => {
    expect(groupKey('PULSE-AAAA-BBBB-CCCC-DDDD-EEEE')).toEqual([
      'AAAA',
      'BBBB',
      'CCCC',
      'DDDD',
      'EEEE',
    ]);
  });

  test('normalizes lowercase + whitespace before chunking', () => {
    // Note: simple normalize strips ws but does NOT re-chunk. The spaces
    // become nothing, so the input becomes 'pulseaaaabbbbccccddddeeee',
    // which lacks the PULSE- prefix and dashes -> [].
    expect(groupKey('pulse aaaa bbbb cccc dddd eeee')).toEqual([]);
    // Canonical form (dashes already in place) works after lowercasing.
    expect(groupKey('pulse-aaaa-bbbb-cccc-dddd-eeee')).toEqual([
      'AAAA',
      'BBBB',
      'CCCC',
      'DDDD',
      'EEEE',
    ]);
  });

  test('returns [] for empty input', () => {
    expect(groupKey('')).toEqual([]);
  });

  test('returns [] for input without PULSE- prefix', () => {
    expect(groupKey('AAAA-BBBB-CCCC-DDDD-EEEE')).toEqual([]);
  });

  test('returns [] for input with wrong number of chunks', () => {
    expect(groupKey('PULSE-AAAA-BBBB-CCCC-DDDD')).toEqual([]);
    expect(groupKey('PULSE-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF')).toEqual([]);
  });
});

describe('isAllowedBase32Char', () => {
  test('accepts letters from the production alphabet', () => {
    for (const c of ['A', 'B', 'H', 'J', 'K', 'M', 'N', 'P', 'Z']) {
      expect(isAllowedBase32Char(c)).toBe(true);
    }
  });

  test('accepts allowed digits 2-9', () => {
    for (const c of ['2', '3', '7', '9']) {
      expect(isAllowedBase32Char(c)).toBe(true);
    }
  });

  test('rejects lookalike letters (I, L, O)', () => {
    for (const c of ['I', 'L', 'O']) {
      expect(isAllowedBase32Char(c)).toBe(false);
    }
  });

  test('rejects lookalike digits (0, 1)', () => {
    for (const c of ['0', '1']) {
      expect(isAllowedBase32Char(c)).toBe(false);
    }
  });

  test('rejects lowercase letters (caller must uppercase first)', () => {
    for (const c of ['a', 'z', 'm']) {
      expect(isAllowedBase32Char(c)).toBe(false);
    }
  });

  test('rejects non-alphanumeric characters', () => {
    for (const c of ['-', ' ', '!', '@', '#']) {
      expect(isAllowedBase32Char(c)).toBe(false);
    }
  });

  test('rejects multi-character strings', () => {
    expect(isAllowedBase32Char('AB')).toBe(false);
    expect(isAllowedBase32Char('A1')).toBe(false);
  });

  test('rejects cyrillic characters', () => {
    // base32 alphabet is ASCII-only
    expect(isAllowedBase32Char('Я')).toBe(false);
    expect(isAllowedBase32Char('А')).toBe(false);
  });
});
