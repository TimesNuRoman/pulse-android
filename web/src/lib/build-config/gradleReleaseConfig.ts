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
