# AGENTS.md

Operational ground truth for AI agents working on the Pulse Android codebase.

## Build & verify

- JDK 17, Gradle 8.13 (wrapper), AGP 8.7.3, Kotlin 2.1.10, KSP 2.1.10-1.0.31, Hilt 2.52.
- `./gradlew assembleDebug` from the project root produces `app/build/outputs/apk/debug/app-debug.apk`.
- `./gradlew assembleRelease` builds a release APK signed with the debug keystore (replace before publishing).
- `./gradlew lint` runs Android Lint.
- `./gradlew test` runs JVM unit tests (none shipped in v1 except WikiLinkExtractor test if added).
- `./gradlew connectedDebugAndroidTest` runs instrumented tests (none shipped in v1).

## Layout

- `app/src/main/java/com/pulse/android/` — Kotlin source.
- `app/src/main/cpp/` — JNI: `CMakeLists.txt` + `native-lib.cpp` (stub by default).
- `app/src/main/res/` — strings, themes, colors, mipmaps, splash.
- `gradle/libs.versions.toml` — version catalog. Bump versions here, not in `app/build.gradle.kts`.

## Hard rules (do not violate)

1. **No `border-radius > 0` anywhere in UI.** All Material 3 shapes are overridden to `RoundedCornerShape(0.dp)` in `theme/Shape.kt`. Don't reintroduce rounded corners on any new component.
2. **Tokyo Night palette only.** Tokens live in `theme/Color.kt`. Don't add new accent colors without updating the design preview.
3. **Dark theme only.** Don't add a light `values/` qualifier.
4. **No "open source" / "Apache 2.0" / "no account" copy in product UI strings.** This is a marketing/legal rule. Repo URL and license file are fine; in-product strings must be neutral.
5. **No emoji in UI strings.** Use Material Icons Outlined or unicode symbols (✓ ✕ → ← ↑ ↓).
6. **No GMS, Firebase, Crashlytics, analytics, ad SDKs.** Single APK, no AAB.
7. **44dp+ touch targets, 48dp+ filled buttons.** Use `Modifier.height(48.dp)` on `Row`s that wrap a clickable area.
8. **English copy only.** All user-visible strings in `res/values/strings.xml`.

## When working on a feature

- Match the existing code style: Hilt DI, Compose with `@Composable` functions, `Flow` for state, `viewModelScope` for work, no coroutines in UI.
- Keep repositories as the only entry point for data. Screens talk to repositories (via `ViewModel`), not DAOs.
- New entities go in `data/model/`, DAOs in `data/db/`. Bump the `@Database(version = …)` and write a migration if you change the schema.
- New screens go in `ui/<feature>/`. Pattern: `XxxScreen.kt` (Compose) + `XxxViewModel.kt` (HiltViewModel). Register the route in `MainActivity.kt`.

## JNI

- `libpulse_llm.so` is built from `app/src/main/cpp/`. The default `PULSE_LLM_STUB=1` produces a working stub. To wire real llama.cpp, see `README.md` § "Wiring llama.cpp".
- JNI method names must match `Java_<package>_<class>_<method>` exactly. Use `javah` / `javap` to regenerate after refactoring the Kotlin side.

## Deployment

- `local.properties` has `sdk.dir` + `ndk.dir`. Don't commit it (it's in `.gitignore`).
- Release builds need a real keystore; configure under `signingConfigs` in `app/build.gradle.kts`.
