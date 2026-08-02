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
  readManifestBackupRules,
  type GradleReleaseConfigCheck,
  type ManifestBackupRulesCheck,
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

  it('defaultConfig declares versionName "0.6.7"', () => {
    expect(cfg?.versionName).toBe('0.6.7');
  });

  it('defaultConfig declares versionCode 17', () => {
    expect(cfg?.versionCode).toBe(17);
  });
});

describe('cycle 32 (P1 #1): AndroidManifest declares backup extraction rules', () => {
  let m: ManifestBackupRulesCheck | null;

  beforeAll(() => {
    m = readManifestBackupRules();
  });

  it('AndroidManifest.xml is readable', () => {
    expect(m).not.toBeNull();
    expect(m?.manifestExists).toBe(true);
  });

  it('declares android:dataExtractionRules="@xml/data_extraction_rules" (Android 12+)', () => {
    expect(m?.declaresDataExtractionRules).toBe(true);
  });

  it('declares android:fullBackupContent="@xml/backup_rules" (Android 6-11)', () => {
    expect(m?.declaresFullBackupContent).toBe(true);
  });

  it('res/xml/data_extraction_rules.xml exists on disk', () => {
    expect(m?.dataExtractionRulesXmlExists).toBe(true);
  });

  it('res/xml/backup_rules.xml exists on disk', () => {
    expect(m?.backupRulesXmlExists).toBe(true);
  });

  it('data_extraction_rules.xml excludes the Capacitor WebView store (cloud-backup + device-transfer)', () => {
    expect(m?.dataExtractionRulesExcludesAppWebview).toBe(true);
  });

  it('backup_rules.xml excludes the Capacitor WebView store (full-backup)', () => {
    expect(m?.backupRulesExcludesAppWebview).toBe(true);
  });
});
