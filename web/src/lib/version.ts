/**
 * APP_VERSION / APP_VERSION_CODE — single source of truth for the
 * installed app identity. Mirrors android/app/build.gradle versionCode
 * and versionName. Bump together on every release.
 *
 * R164: introduced so the new updateChecker and UpdateBanner can import
 * the version from one place. The legacy lib/update-checker/
 * update-checker.ts module (R88 / R90 / R103) also exports the same
 * names; that file is out of scope for R164 and will be migrated in a
 * future round to import from here.
 *
 *  - APP_VERSION          = "0.6.7"  (matches R121 deploy @ ownlocalml.com)
 *  - APP_VERSION_CODE     = 17       (must match android/app/build.gradle)
 */
export const APP_VERSION = '0.6.7';
export const APP_VERSION_CODE = 17;
