// SPDX-License-Identifier: Apache-2.0
// Pulse - license key format validation (R199 license foundation, mirrors
// pulse-desktop R119 validate.ts).
//
// Format: `PULSE-XXXX-XXXX-XXXX-XXXX-XXXX`
//   * 5 groups x 4 base32 chars (RFC 4648 alphabet: A-Z 2-7, no 0/O/1/I/L)
//   * Total length: 30 chars (6 prefix + 4 x 5 chunks + 4 inner dashes)
//
// This is a *format* check only - the real check is the server ping (R200+).
// Per architecture doc: "Client trust = format check + encrypted local cache
// + 14-day grace. Real validation = server ping."
//
// Pure functions. No I/O, no clock, no DOM. Safe in renderer and tests.

import type { LicenseTier, ValidateKeyResult } from './types';

/** RFC 4648 base32 chunk: 4 chars from [A-Z 2-7], no 0/O/1/I/L lookalikes.
 *  The single-character form of this is exposed via `isAllowedBase32Char`
 *  for the on-screen keypad (R200+ UI). */
const BASE32_CHUNK = '[A-HJ-KM-NP-Z2-9]{4}';

/** Compiled regex. Reused across calls. Matches the canonical 5-group form
 *  after normalization (PULSE- prefix + 5 x 4-char base32 chunks). */
const KEY_PATTERN = new RegExp(
  '^PULSE-' + BASE32_CHUNK + '(-' + BASE32_CHUNK + '){4}$',
);

/** Hardcoded test key, accepted in dev mode without server ping.
 *  Android-side: this is the "paste this in the license input" key for
 *  the emulator and for screenshots. The desktop uses
 *  'PULSE-TEST1-TEST1-TEST1-TEST1-TEST1' (contains '1', outside the
 *  production base32 alphabet). Android's variant uses only A/B/C/D/E
 *  so it round-trips through `normalizeKey` cleanly without a
 *  passthrough branch - simpler, no test-key special case in
 *  `validateKey` or `normalizeKey`. */
export const TEST_KEY = 'PULSE-AAAA-BBBB-CCCC-DDDD-EEEE';

/** Normalize user input: trim + uppercase + strip whitespace.
 *  Dashes are kept (the paste UI relies on them for visual chunking).
 *  Anything that doesn't match the canonical 5-group form will fail
 *  `validateKey` later - `normalizeKey` is purely a "best effort to
 *  canonicalize", not a validator.
 *
 *  Examples:
 *    "  pulse-7yhk-dn9q-xv5b-wm4z-abcd  " -> "PULSE-7YHK-DN9Q-XV5B-WM4Z-ABCD"
 *    ""                                     -> ""
 *    "PULSE AAAA BBBB CCCC DDDD EEEE"       -> "PULSE-AAAA-BBBB-CCCC-DDDD-EEEE"
 *    "garbage"                              -> "GARBAGE" (invalid format)
 */
export function normalizeKey(rawKey: string): string {
  return rawKey.trim().toUpperCase().replace(/\s+/g, '');
}

/** True if `c` is a single base32 char from the production alphabet.
 *  Used by the on-screen keypad in the license entry view (R200+) to
 *  decide which keys to enable. Rejects lookalikes that would cause
 *  support tickets later: 0, O, 1, I, L. */
export function isAllowedBase32Char(c: string): boolean {
  return /^[A-HJ-KM-NP-Z2-9]$/.test(c);
}

/** Group a normalized key into 5 x 4 chunks for the paste UI.
 *  Returns the 5-element array ['AAAA', 'BBBB', 'CCCC', 'DDDD', 'EEEE'].
 *  Returns [] if the input doesn't start with `PULSE-` or doesn't have
 *  exactly 5 dash-separated chunks. The caller is expected to have run
 *  `normalizeKey` first; this function does NOT lowercase or strip
 *  whitespace. */
export function groupKey(key: string): string[] {
  const normalized = normalizeKey(key);
  if (!normalized.startsWith('PULSE-')) return [];
  const chunks = normalized.split('-');
  if (chunks.length !== 6) return [];
  return chunks.slice(1);
}

/** End-to-end validation: format + tier decision.
 *  R199 stub: format-valid = tier='pro'. No server check yet. R200+
 *  will add a real ping against the MoR (Polar.sh) backend.
 *  Returns:
 *    * { valid: true,  tier: 'pro'  } for TEST_KEY or any canonical 5-group
 *      key matching KEY_PATTERN.
 *    * { valid: false, tier: 'free', error: 'empty'  } for empty / whitespace-only.
 *    * { valid: false, tier: 'free', error: 'format' } for any other input. */
export function validateKey(rawKey: string): ValidateKeyResult {
  const normalized = normalizeKey(rawKey);
  if (!normalized) {
    return { valid: false, tier: 'free', error: 'empty' };
  }
  if (normalized === TEST_KEY) {
    return { valid: true, tier: 'pro' };
  }
  if (!KEY_PATTERN.test(normalized)) {
    return { valid: false, tier: 'free', error: 'format' };
  }
  // R199: format-valid = accepted. R200+: real server ping here.
  return { valid: true, tier: 'pro' };
}
