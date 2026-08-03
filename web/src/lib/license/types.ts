// SPDX-License-Identifier: Apache-2.0
// Pulse - license types for Android (R199 license foundation, mirrors
// pulse-desktop R119 + R191).
//
// Single source of truth for license shape on the Android client. Shared
// between the web/ bundle (UI gating, key entry) and the Capacitor 8
// wrapper (persistent storage key). The store + persistence layer lands
// in R200+.
//
// Architectural decisions (PULSE-PRO-ARCHITECTURE-2026-08-02.md, R191):
//   * `key` is an opaque bearer token. No client crypto proof.
//   * `tier` = 'free' | 'pro'. R191 trial: `tier` stays 'pro' during a
//     fresh trial so legacy `isPro()` consumers that read `tier` still
//     pass; the *status* check is the single source of truth for
//     "is the trial still valid?".
//   * `status` is a state-machine value used by the UI:
//       'none'             -> no license on disk, no trial started
//       'trial'            -> 14-day auto-started trial, not yet expired
//       'valid'            -> valid key, ping OK (or just-activated)
//       'expired'          -> key format valid but exp < now, OR trial elapsed
//       'offline-grace'    -> key valid + cached, but ping > 14d old
//   * `expiresAt` = unix-ms timestamp. `null` = lifetime / test key.
//   * `lastValidated` = unix-ms of last successful validate/ping. Used for
//     grace-period calculation.
//   * `trialStartedAt` = unix-ms when the trial was first started. `null`
//     = no trial yet (legacy install, or first launch hasn't run).

/** A PRO feature. The enum here is the type-side contract; the catalog and
 *  free-fallback info live in `web/src/lib/pro-features.ts` (R200+). */
export type ProFeature =
  | 'multi-model'        // hot-swap between multiple LLM models
  | 'code-intel'         // tree-sitter symbol extraction / cross-file refs
  | 'voice-input'        // Whisper STT (vs OS SpeechRecognition which is free)
  | 'web-search'         // Habr / YouTube search inside panel
  | 'settings-sync'      // (R200+) cloud sync of settings
  | 'priority-updates';  // (R200+) early-access release channel

/** License tier. Kept narrow on purpose: anything new = new round + migration. */
export type LicenseTier = 'free' | 'pro';

/** License state for UI. Drives badge color, modal triggers, grace banners. */
export type LicenseStatus =
  | 'none'            // no license on disk, no trial started
  | 'trial'           // 14-day trial running, not yet expired
  | 'valid'           // ping OK (or never pinged, freshly activated)
  | 'expired'         // key format valid but exp < now, OR trial elapsed
  | 'offline-grace';  // cached OK but server ping > 14d ago

/** Persistent license record. Serialized to localStorage in R200+ under
 *  a single key (e.g. `pulse.license.v1`). */
export interface License {
  /** The raw key, e.g. "PULSE-7YHK-DN9Q-XV5B-WM4Z-ABCD". Empty for free / trial. */
  key: string;
  /** Current state. Single source of truth for "is this license usable?". */
  status: LicenseStatus;
  /** 'free' if no key / expired; 'pro' if valid OR trial still running.
   *  R191: the trial is "PRO with an expiry check", not a separate tier.
   *  Read `status` to distinguish fresh-trial from activated-PRO. */
  tier: LicenseTier;
  /** Unix-ms expiration timestamp. `null` = lifetime / no expiry. */
  expiresAt: number | null;
  /** Unix-ms when validate/ping last succeeded. Used for grace math. */
  lastValidated: number;
  /** Unix-ms when the 14-day trial was first started. `null` = no trial
   *  yet (legacy install, or first launch hasn't run). When `status` is
   *  'trial' or 'expired' (from trial), this is non-null. */
  trialStartedAt: number | null;
}

/** Duration of the auto-started 14-day PRO trial (R191). */
export const TRIAL_DURATION_MS = 14 * 24 * 60 * 60 * 1000;

/** Offline grace window. If a previously-valid key fails to ping, the
 *  UI keeps it usable for this many ms past `lastValidated` before
 *  flipping to 'expired'. Mirrors the desktop constant. */
export const GRACE_PERIOD_MS = 14 * 24 * 60 * 60 * 1000;

/** Empty / pre-trial license. Default before any activation AND before
 *  the first launch has auto-started the trial. `tier = 'pro'` so legacy
 *  `isPro()` consumers that key off `tier` behave as expected once the
 *  trial is auto-started (R200 flow: cold start -> `load()` ->
 *  `startTrial()` -> `tier = 'pro'`, `status = 'trial'`). The status is
 *  the source of truth for trial validity - `isPro()` checks
 *  `status === 'valid'` OR (`status === 'trial'` AND not elapsed). */
export const EMPTY_LICENSE: License = {
  key: '',
  status: 'none',
  tier: 'pro',
  expiresAt: null,
  lastValidated: 0,
  trialStartedAt: null,
};

/** Sentinel error type for `requirePro(feature)`. UI catches this and shows
 *  the upgrade modal. Never thrown for non-PRO paths. */
export class ProRequiredError extends Error {
  readonly feature: ProFeature;
  constructor(feature: ProFeature, message?: string) {
    super(message ?? 'PRO license required for feature: ' + feature);
    this.name = 'ProRequiredError';
    this.feature = feature;
  }
}

/** Result of format validation. Returned synchronously, no I/O. */
export interface ValidateKeyResult {
  valid: boolean;
  tier: LicenseTier;
  /** Machine-readable reason, only set when `valid === false`. */
  error?: string;
}

/** Result of license_ping (server stub for R200+; mobile uses the same
 *  shape so the swap to a real endpoint is a no-op on the consumer side). */
export interface LicensePingResult {
  valid: boolean;
  tier: LicenseTier;
  /** Unix-ms exp returned by server. `null` if server didn't return one. */
  expiresAt: number | null;
  /** Optional human-readable note for UI (e.g. "server unreachable"). */
  message?: string;
}
