// R93b: tests for android release-build pipeline static checks.
//
// These are static text checks, not gradle-runtime tests.
// Running `gradlew assembleRelease` in a vitest environment would be too
// slow and requires a full Android SDK + emulator. The helper
// `readGradleReleaseConfig` parses build.gradle and returns structural
// invariants. If you change build.gradle, this test will tell you which
// invariants broke.

import { describe, it, expect, beforeAll } from 'vitest';
import {
  readGradleReleaseConfig,
  type GradleReleaseConfigCheck,
} from '../gradleReleaseConfig';

describe('R93b: android/app/build.gradle release pipeline', () => {
  let cfg: GradleReleaseConfigCheck | null;

  beforeAll(() => {
    cfg = readGradleReleaseConfig();
  });

  it('build.gradle exists and is readable', () => {
    expect(cfg).not.toBeNull();
  });

  it('declares signingConfigs { release { ... } }', () => {
    expect(cfg?.hasSigningConfigsRelease).toBe(true);
  });

  it('reads signing credentials from app/keystore.properties (not hardcoded)', () => {
    expect(cfg?.readsKeystoreProperties).toBe(true);
    expect(cfg?.neverHardcodesPassword).toBe(true);
    expect(cfg?.hasNoHardcodedStorePasswordLiteral).toBe(true);
  });

  it('buildTypes includes BOTH debug and release', () => {
    expect(cfg?.hasBuildTypeDebug).toBe(true);
    expect(cfg?.hasBuildTypeRelease).toBe(true);
  });

  it('release buildType wires signingConfig to signingConfigs.release', () => {
    expect(cfg?.releaseWiresSigningConfig).toBe(true);
  });

  it('release buildType enables minifyEnabled and shrinkResources', () => {
    expect(cfg?.releaseEnablesMinify).toBe(true);
    expect(cfg?.releaseEnablesShrinkResources).toBe(true);
  });

  it('falls back to debug signing when keystore.properties is missing (contributor safety net)', () => {
    expect(cfg?.hasFallbackForMissingKeystore).toBe(true);
  });
});
