// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { parseDeeplink } from '../deeplink';

describe('parseDeeplink', () => {
  it('parses pulse://note/{id} into a note deeplink', () => {
    expect(parseDeeplink('pulse://note/abc123')).toEqual({
      type: 'note',
      id: 'abc123',
    });
  });

  it('tolerates a trailing slash on pulse://note/{id}/', () => {
    expect(parseDeeplink('pulse://note/abc123/')).toEqual({
      type: 'note',
      id: 'abc123',
    });
  });

  it('returns null for the bare pulse:// scheme', () => {
    expect(parseDeeplink('pulse://')).toBeNull();
  });

  it('returns null for non-URL strings', () => {
    expect(parseDeeplink('invalid')).toBeNull();
    expect(parseDeeplink('just a path/note/abc')).toBeNull();
  });

  it('returns null for null or empty input', () => {
    expect(parseDeeplink(null)).toBeNull();
    expect(parseDeeplink(undefined)).toBeNull();
    expect(parseDeeplink('')).toBeNull();
  });

  it('returns unknown for unrecognised paths under the scheme', () => {
    expect(parseDeeplink('pulse://settings')).toEqual({
      type: 'unknown',
      raw: 'pulse://settings',
    });
  });
});
