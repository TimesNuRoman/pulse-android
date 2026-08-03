// SPDX-License-Identifier: Apache-2.0
// Tests for license types module (R199 license foundation).
//
// Pure shape and value checks. No DOM, no Capacitor. Run via `npm test`.

import { describe, test, expect } from 'vitest';
import {
  EMPTY_LICENSE,
  TRIAL_DURATION_MS,
  GRACE_PERIOD_MS,
  ProRequiredError,
} from '../types';
import type { License, LicenseStatus, LicenseTier, ProFeature } from '../types';

describe('EMPTY_LICENSE', () => {
  test('has status=none', () => {
    expect(EMPTY_LICENSE.status).toBe('none');
  });

  test('has tier=pro (R191 architectural decision)', () => {
    // tier='pro' during trial/valid so legacy isPro() consumers that read
    // tier still pass. The status check is the source of truth.
    expect(EMPTY_LICENSE.tier).toBe('pro');
  });

  test('has key=empty', () => {
    expect(EMPTY_LICENSE.key).toBe('');
  });

  test('has null expiresAt', () => {
    expect(EMPTY_LICENSE.expiresAt).toBeNull();
  });

  test('has 0 lastValidated', () => {
    expect(EMPTY_LICENSE.lastValidated).toBe(0);
  });

  test('has null trialStartedAt', () => {
    expect(EMPTY_LICENSE.trialStartedAt).toBeNull();
  });

  test('is frozen-by-convention (all 6 fields present)', () => {
    // We don't Object.freeze() at runtime (cost on hot path); this test
    // guards the shape so future R-rounds don't drop a field.
    const requiredKeys: (keyof License)[] = [
      'key',
      'status',
      'tier',
      'trialStartedAt',
      'expiresAt',
      'lastValidated',
    ];
    for (const k of requiredKeys) {
      expect(EMPTY_LICENSE).toHaveProperty(k);
    }
  });
});

describe('TRIAL_DURATION_MS', () => {
  test('equals 14 days in milliseconds', () => {
    expect(TRIAL_DURATION_MS).toBe(14 * 24 * 60 * 60 * 1000);
    expect(TRIAL_DURATION_MS).toBe(1_209_600_000);
  });
});

describe('GRACE_PERIOD_MS', () => {
  test('equals 14 days in milliseconds', () => {
    expect(GRACE_PERIOD_MS).toBe(14 * 24 * 60 * 60 * 1000);
    expect(GRACE_PERIOD_MS).toBe(1_209_600_000);
  });

  test('matches TRIAL_DURATION_MS (same window)', () => {
    // Per architecture: trial duration == offline grace. Documented equality.
    expect(GRACE_PERIOD_MS).toBe(TRIAL_DURATION_MS);
  });
});

describe('ProRequiredError', () => {
  test('is an instance of Error', () => {
    const err = new ProRequiredError('multi-model');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ProRequiredError);
  });

  test('exposes the feature on .feature', () => {
    const err = new ProRequiredError('code-intel');
    expect(err.feature).toBe('code-intel');
  });

  test('default message includes the feature name', () => {
    const err = new ProRequiredError('voice-input');
    expect(err.message).toContain('voice-input');
    expect(err.message).toContain('PRO');
  });

  test('custom message overrides default', () => {
    const err = new ProRequiredError('web-search', 'Custom upgrade prompt');
    expect(err.message).toBe('Custom upgrade prompt');
  });

  test('name is ProRequiredError (not generic Error)', () => {
    const err = new ProRequiredError('multi-model');
    expect(err.name).toBe('ProRequiredError');
  });

  test('accepts every ProFeature enum value', () => {
    const features: ProFeature[] = [
      'multi-model',
      'code-intel',
      'voice-input',
      'web-search',
      'settings-sync',
      'priority-updates',
    ];
    for (const f of features) {
      const err = new ProRequiredError(f);
      expect(err.feature).toBe(f);
    }
  });
});

describe('Type-level contract (compile-time only, runtime smoke check)', () => {
  test('LicenseTier accepts only "free" | "pro"', () => {
    const tiers: LicenseTier[] = ['free', 'pro'];
    expect(tiers).toHaveLength(2);
    expect(tiers).toContain('free');
    expect(tiers).toContain('pro');
  });

  test('LicenseStatus accepts 5 values (none, trial, valid, expired, offline-grace)', () => {
    const statuses: LicenseStatus[] = [
      'none',
      'trial',
      'valid',
      'expired',
      'offline-grace',
    ];
    expect(statuses).toHaveLength(5);
    // Distinct from each other
    expect(new Set(statuses).size).toBe(5);
  });

  test('ProFeature accepts 6 values', () => {
    const features: ProFeature[] = [
      'multi-model',
      'code-intel',
      'voice-input',
      'web-search',
      'settings-sync',
      'priority-updates',
    ];
    expect(features).toHaveLength(6);
    expect(new Set(features).size).toBe(6);
  });
});
