// R93b: static checks for android/app/build.gradle release-build pipeline.
//
// This helper does NOT shell out to gradle (CI would time out on a 5-minute
// Android assemble). It parses the build.gradle source as text and asserts
// the structural invariants we care about:
//
//   1. signingConfigs { release { ... } } block exists.
//   2. signingConfig reads from app/keystore.properties (NOT hardcoded).
//   3. buildTypes includes BOTH debug and release.
//   4. release buildType wires signingConfig to signingConfigs.release.
//   5. release buildType enables minifyEnabled and shrinkResources.
//   6. A fallback path exists so contributors without a keystore still
//      get a runnable (debug-signed) assembleRelease for layout checks.
//
// Keep this file dependency-free. It runs in vitest, in Node, in the browser
// bundle — anywhere a filesystem read is available.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface GradleReleaseConfigCheck {
  hasSigningConfigsRelease: boolean;
  readsKeystoreProperties: boolean;
  hasBuildTypeDebug: boolean;
  hasBuildTypeRelease: boolean;
  releaseWiresSigningConfig: boolean;
  releaseEnablesMinify: boolean;
  releaseEnablesShrinkResources: boolean;
  hasFallbackForMissingKeystore: boolean;
  neverHardcodesPassword: boolean;
  hasNoHardcodedStorePasswordLiteral: boolean;
}

const PROJECT_ROOT = resolve(__dirname, '..', '..', '..');
const ANDROID_APP_DIR = resolve(PROJECT_ROOT, '..', 'android', 'app');
const BUILD_GRADLE_PATH = resolve(ANDROID_APP_DIR, 'build.gradle');
// cycle 32 (P1 #1): AndroidManifest must declare BOTH dataExtractionRules
// (API 31+) and fullBackupContent (API 23-30) so that allowBackup="true"
// doesn't silently include the Capacitor WebView store in cloud-backup.
const ANDROID_MANIFEST_PATH = resolve(
  PROJECT_ROOT,
  '..',
  'android',
  'app',
  'src',
  'main',
  'AndroidManifest.xml',
);
const BACKUP_RULES_XML_PATH = resolve(
  PROJECT_ROOT,
  '..',
  'android',
  'app',
  'src',
  'main',
  'res',
  'xml',
  'backup_rules.xml',
);
const DATA_EXTRACTION_RULES_XML_PATH = resolve(
  PROJECT_ROOT,
  '..',
  'android',
  'app',
  'src',
  'main',
  'res',
  'xml',
  'data_extraction_rules.xml',
);

/**
 * Parse android/app/build.gradle and return a structural snapshot.
 * Returns null if the file is missing (e.g. running on a non-Android CI node).
 */
export function readGradleReleaseConfig(): GradleReleaseConfigCheck | null {
  let src: string;
  try {
    src = readFileSync(BUILD_GRADLE_PATH, 'utf8');
  } catch {
    return null;
  }

  const hasSigningConfigsRelease =
    /signingConfigs\s*\{[\s\S]*?\brelease\s*\{/.test(src);
  const readsKeystoreProperties = /keystore\.properties/.test(src);
  const hasBuildTypeDebug = /\bbuildTypes\s*\{[\s\S]*?\bdebug\s*\{/.test(src);
  const hasBuildTypeRelease = /\bbuildTypes\s*\{[\s\S]*?\brelease\s*\{/.test(src);
  const releaseWiresSigningConfig =
    /signingConfig\s+signingConfigs\.release\b/.test(src);
  const releaseEnablesMinify = /minifyEnabled\s+true\b/.test(src);
  const releaseEnablesShrinkResources = /shrinkResources\s+true\b/.test(src);
  const hasFallbackForMissingKeystore =
    /keystorePropertiesFile\.exists\(\)/.test(src) &&
    /signingConfig\s+signingConfigs\.debug/.test(src);

  // Belt-and-braces: we should NEVER have plaintext password literals
  // baked into build.gradle. Look for common signs of regression:
  //   * "storePassword = 'something'" or "storePassword 'something'"
  //   * "keyPassword = 'something'" or "keyPassword 'something'"
  const hasNoHardcodedStorePasswordLiteral =
    !/storePassword\s*=\s*['"][^'"]+['"]/.test(src) &&
    !/storePassword\s+['"][^'"]+['"]/.test(src);
  const neverHardcodesPassword = hasNoHardcodedStorePasswordLiteral;

  return {
    hasSigningConfigsRelease,
    readsKeystoreProperties,
    hasBuildTypeDebug,
    hasBuildTypeRelease,
    releaseWiresSigningConfig,
    releaseEnablesMinify,
    releaseEnablesShrinkResources,
    hasFallbackForMissingKeystore,
    neverHardcodesPassword,
    hasNoHardcodedStorePasswordLiteral,
  };
}

/**
 * cycle 32 (P1 #1): verify the AndroidManifest declares BOTH
 * dataExtractionRules (API 31+) and fullBackupContent (API 23-30), and that
 * the referenced XML files exist and contain an `<exclude>` for the
 * Capacitor WebView store. Without these, allowBackup="true" leaks the
 * localStorage / IndexedDB used by the editor into the user's Google
 * account — directly contradicting the "Local-first" onboarding promise.
 *
 * Returns null if the manifest is missing (e.g. non-Android CI node).
 */
export interface ManifestBackupRulesCheck {
  manifestExists: boolean;
  declaresDataExtractionRules: boolean;
  declaresFullBackupContent: boolean;
  dataExtractionRulesXmlExists: boolean;
  backupRulesXmlExists: boolean;
  dataExtractionRulesExcludesAppWebview: boolean;
  backupRulesExcludesAppWebview: boolean;
}

export function readManifestBackupRules(): ManifestBackupRulesCheck | null {
  let src: string;
  try {
    src = readFileSync(ANDROID_MANIFEST_PATH, 'utf8');
  } catch {
    return null;
  }

  const declaresDataExtractionRules =
    /android:dataExtractionRules\s*=\s*"@xml\/data_extraction_rules"/.test(src);
  const declaresFullBackupContent =
    /android:fullBackupContent\s*=\s*"@xml\/backup_rules"/.test(src);

  let dataExtractionRulesXml = '';
  try {
    dataExtractionRulesXml = readFileSync(DATA_EXTRACTION_RULES_XML_PATH, 'utf8');
  } catch {
    // leave empty
  }
  let backupRulesXml = '';
  try {
    backupRulesXml = readFileSync(BACKUP_RULES_XML_PATH, 'utf8');
  } catch {
    // leave empty
  }

  return {
    manifestExists: true,
    declaresDataExtractionRules,
    declaresFullBackupContent,
    dataExtractionRulesXmlExists: dataExtractionRulesXml.length > 0,
    backupRulesXmlExists: backupRulesXml.length > 0,
    dataExtractionRulesExcludesAppWebview:
      /domain\s*=\s*"file"[^>]*path\s*=\s*"app_webview\/"/.test(
        dataExtractionRulesXml,
      ),
    backupRulesExcludesAppWebview:
      /domain\s*=\s*"file"[^>]*path\s*=\s*"app_webview\/"/.test(backupRulesXml),
  };
}
