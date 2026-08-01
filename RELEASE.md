# Pulse Android — release-build pipeline (R93b)

This document explains how to produce a signed APK / AAB suitable for
distribution on the Play Store or F-Droid. It is the operational follow-up
to the R91a Verifier audit P0 ("no Android keystore — blocks v0.7+").

## Prerequisites

- JDK 17+ (`java -version` should print 17 or higher).
- Android SDK with `build-tools;36.0.0` (or any modern build-tools release).
- `apksigner` and `keytool` on the PATH (shipped with the JDK and the SDK).

## Step 1 — Generate a release keystore

Run **once per keystore lifetime** (typically once per project). The keystore
file is the *only* artifact that proves you are the publisher of the APK.
**If you lose it, you cannot publish updates under the same identity.**

```bash
cd android/app
keytool -genkey -v \
  -keystore release.keystore \
  -storetype JKS \
  -alias pulse-release \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass <storepass> \
  -keypass  <keypass> \
  -dname "CN=Pulse Notes, OU=Pulse, O=Lesside, L=Brest, S=Brest, C=BY"
```

Notes:

- `validity 10000` (~27 years) is intentional — keystore regeneration
  invalidates the Play Store listing unless you enroll in Play App Signing.
- Use **JKS** (not PKCS12). PKCS12 silently forces `storepass == keypass`
  and breaks distinct-password tooling.
- The `dname` fields are public — they appear in every signed APK's
  certificate. Pick a stable identity (we use `Lesside` as the O field).
- **NEVER commit `release.keystore`.** The root `.gitignore` and
  `android/.gitignore` both block it.

## Step 2 — Create the local properties file

The template `android/app/keystore.properties.example` is committed; the
real file is gitignored.

```bash
cp android/app/keystore.properties.example android/app/keystore.properties
# Edit android/app/keystore.properties and replace the two CHANGEME_* placeholders.
```

The file looks like:

```properties
storeFile=release.keystore
storePassword=<your storepass>
keyAlias=pulse-release
keyPassword=<your keypass>
```

`android/app/build.gradle` reads this file on every build. If it is
missing, the release build falls back to the debug keystore — that is a
*contributor safety net*, not a real release path. The Play Console and
F-Droid will reject a debug-signed APK.

## Step 3 — Build the release artifact

From the repository root (`pulse-android/`):

```bash
npm run build:web
npx cap sync android
cd android
./gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`

For a Play Store upload you usually want an AAB instead:

```bash
./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

## Step 4 — Verify the signature

```bash
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --print-certs \
  android/app/build/outputs/apk/release/app-release.apk
```

The output must show a certificate whose `Owner` matches the `dname` you
chose in Step 1, and the `Signer #1 certificate SHA-256` should match the
value you recorded at the bottom of this document (see Step 7).

If the verification prints `WARNING: ... not signed` or shows a certificate
with `Owner: CN=Android Debug, O=Android, C=US`, the build fell back to
debug signing. Go back to Step 2 and confirm `android/app/keystore.properties` exists.

## Step 5 — Upload

**Play Store**

1. Open the Play Console, select Pulse Notes.
2. Testing → Internal testing → Create new release.
3. Upload `app-release.aab`.
4. Fill in the release notes (see `CHANGELOG.md`).
5. Roll out to internal testers first; promote to production after smoke.

**F-Droid**

F-Droid rebuilds from source under their own reproducible-build pipeline.
The signed APK you produce here is only useful for **manual side-loads**
from the Pulse landing page. Submit the source repository to
<https://f-droid.org/docs/Submitting/> and let F-Droid produce its own
build artifacts.

## Step 6 — Bump versionCode for the next release

Both `versionCode` (monotonic integer) and `versionName` (human label)
live in `android/app/build.gradle`:

```groovy
defaultConfig {
    versionCode 14
    versionName "0.6.4"
}
```

- `versionCode` MUST be strictly greater than the previous value. Play
  Store rejects same-or-lower codes.
- `versionName` is the human label users see in About → Version. It can
  repeat the previous `versionCode`'s label scheme.

After bumping, also update:

- `package.json` (`"version": "..."`).
- `web/package.json` (`"version": "..."`, if present).
- `updates/android.json` (`latest_version`, `versionCode`, `latest_apk_url`).
- The Pulse landing site (R-cycle handles this; see `pulse-landing` repo).

## Step 7 — Record the certificate fingerprint (recommended)

After Step 4, record the SHA-256 fingerprint shown by `apksigner verify
--print-certs` somewhere durable (password manager, printed copy in a
fireproof envelope, etc.). When the F-Droid maintainer asks "is this the
real build?", you can compare fingerprints.

## Security notes

- **NEVER** commit `release.keystore` or `keystore.properties`. The
  `.gitignore` files block both at root and at `android/`.
- **NEVER** paste a password into chat, issue tracker, or commit message.
  This document uses `<storepass>` / `<keypass>` placeholders only.
- **NEVER** share `release.keystore` over an unencrypted channel. Copy
  it to a USB drive or scp it over SSH.
- For production, enroll in **Play App Signing**: Google holds the upload
  key, you keep the signing key. See
  <https://support.google.com/googleplay/android-developer/answer/9842756>.

## Recovery — what to do if the keystore is lost

Losing `release.keystore` is a P0 incident. The Pulse app would be unable
to ship updates under the same identity. The two recovery paths:

1. **Play App Signing** (recommended if already enrolled): Google re-signs
   your APK with the key they hold. You publish under the Play-managed
   identity going forward.
2. **applicationId bump** (last resort, breaks upgrades): change
   `applicationId` in `build.gradle` to e.g. `app.pulse.notes.v2`,
   re-generate a fresh keystore, publish as a brand-new app. Existing
   users cannot migrate automatically.

For F-Droid the situation is simpler: F-Droid rebuilds from source under
their own key. Your lost keystore only affects your *manual* side-loads.

## What R93b changed (for future maintainers)

- `android/app/build.gradle`: added `signingConfigs.release` reading from
  `android/app/keystore.properties`; `buildTypes.release` wires the
  signing config and enables `minifyEnabled` + `shrinkResources`; the
  `debug` build type is unchanged (no regression for the debug pipeline).
- `android/app/keystore.properties.example`: committed template with
  `CHANGEME_*` placeholders.
- `android/.gitignore` + root `.gitignore`: block `*.keystore`,
  `*.jks`, `keystore.properties`; explicitly allow the `.example`
  template via `!`-prefixed rules.
- `web/src/lib/build-config/gradleReleaseConfig.ts` + accompanying test:
  static structural checks for the gradle config; fails the build if a
  future refactor accidentally hardcodes a password or drops the
  release signing wire-up.
- This file (`RELEASE.md`): the operational runbook.
