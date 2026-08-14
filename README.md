# Pulse for Android

Local-first markdown notes with backlinks, voice input, and an integrated local-LLM chat. Single sideloaded APK. No Play Services, no analytics, no cloud STT.

> v0.1.0 · Android 7.0+ (API 24) · target Android 15 (API 35)

---

## What's in the box

- **8 screens** wired to a single bottom nav: Onboarding (3 cards), Notes list, Note editor, `[[` autocomplete, Chat, Voice input modal, Search, Settings.
- **Local-first storage**: Room (SQLite) + FTS5 shadow table for full-text search.
- **Markdown editor** with source / preview modes, `[[wiki-links]]`, checklists, code blocks, headings, bold/italic.
- **Live backlinks** panel on the editor; recomputed on every save.
- **Local LLM chat** via JNI to `libpulse_llm.so`. The shipped `native-lib.cpp` is a **stub** that produces a placeholder token stream so the UI is end-to-end testable without a real model. Drop in llama.cpp to enable real inference.
- **Voice input** via Android `SpeechRecognizer` with the on-device preference flag set; no Google STT fallback unless the device lacks the on-device recognizer.
- **Sync (PRO)** via WorkManager + AES-256-GCM. Outbound queue in `sync_queue`. Server endpoint: `https://api.ownlocalml.com/sync/push`. Key derivation: scrypt (N=2¹⁵, r=8, p=1).

## Build

### Prerequisites

- JDK 17 (Temurin / Adoptium recommended).
- Android SDK with `compileSdk = 35`, `minSdk = 24`. `build-tools 34.0.0` or newer.
- NDK 27.x (for JNI compile of `libpulse_llm.so`).
- Set `ANDROID_HOME` or `local.properties` `sdk.dir`.

### Assemble a debug APK

```
cd pulse-android
./gradlew assembleDebug
```

Output: `app/build/outputs/apk/debug/app-debug.apk`. Application id is `com.pulse.android.debug` for the debug build.

### Install on a device

```
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### Release APK

```
./gradlew assembleRelease
```

Release is signed with the debug keystore by default — replace `signingConfigs` in `app/build.gradle.kts` with a real keystore before publishing.

## Architecture

```
app/src/main/
├── AndroidManifest.xml
├── cpp/
│   ├── CMakeLists.txt
│   └── native-lib.cpp        # JNI bridge (stub by default)
├── java/com/pulse/android/
│   ├── MainActivity.kt       # single-activity host, nav graph
│   ├── PulseApp.kt           # @HiltAndroidApp, WorkManager factory
│   ├── di/DataModule.kt      # Hilt bindings
│   ├── data/
│   │   ├── db/               # Room: entities, DAOs, AppDatabase, FTS triggers
│   │   ├── llm/              # LlamaEngine (JNI), ModelDownloader
│   │   ├── model/            # Note, ChatMessage, Conversation, SyncQueue
│   │   ├── repo/             # NoteRepository, ChatRepository
│   │   ├── sync/             # CryptoBox (AES-GCM), SyncWorker
│   │   └── voice/            # VoiceTranscriber
│   ├── theme/                # Color, Type, Shape, Theme (Tokyo Night, dark only)
│   ├── ui/
│   │   ├── components/       # BottomNav, TopBar, Toggle, NoteRow, BacklinksBar
│   │   ├── onboarding/       # OnboardingScreen, OnboardingViewModel
│   │   ├── notes/            # NotesListScreen, NoteEditorScreen, LinkAutocomplete
│   │   ├── chat/             # ChatScreen, ChatHistoryDrawer, VoiceInputModal
│   │   ├── search/           # SearchScreen, SearchViewModel
│   │   └── settings/         # SettingsScreen, SettingsViewModel
│   └── util/                 # MarkdownRenderer, WikiLinkExtractor, HapticFeedback
└── res/                      # strings, themes, colors, mipmaps, splash
```

## Design rules (locked)

- **`border-radius: 0` global.** All shapes are zero-corner. `PulseShapes` overrides every Material 3 shape token to `RoundedCornerShape(0.dp)`.
- **Tokyo Night palette only.** Tokens in `theme/Color.kt`. `colors.xml` mirrors the same hex values for the system-level surfaces.
- **Dark only.** `values-night/themes.xml` mirrors `values/themes.xml`; both dark.
- **No "open source" / "Apache 2.0" / "no account" copy in product strings.** Source / license lives in `LICENSE` and the repo URL — not in the UI.
- **No emoji in UI.** Use stroke-based Material Icons (Outlined). The only filled icons are the FAB `+` and the toggle dot.
- **44dp+ touch targets, 48dp+ filled buttons.**
- **English copy only.** All strings in `res/values/strings.xml`.

## Permissions

| Permission            | Why                                          | When requested                       |
|-----------------------|----------------------------------------------|--------------------------------------|
| `INTERNET`            | Sync + model download                        | Default granted                      |
| `ACCESS_NETWORK_STATE`| Sync gate (only when online)                 | Default granted                      |
| `RECORD_AUDIO`        | Voice input (mic button in chat/editor)      | Runtime, when user taps mic          |
| `POST_NOTIFICATIONS`  | Sync completion (Android 13+)                | After first successful sync          |

No location, contacts, storage, camera, phone state. No Google Play Services, Firebase, Crashlytics, analytics, or ad SDKs. Single APK, no splits, no AAB.

## Wiring llama.cpp (real inference)

The shipped `libpulse_llm.so` is a stub. To enable real inference:

1. Vendor the llama.cpp source under `app/src/main/cpp/llama.cpp/` (e.g. `git clone https://github.com/ggerganov/llama.cpp --branch master --depth 1`).
2. Edit `app/src/main/cpp/CMakeLists.txt`:
   - Add `add_subdirectory(llama.cpp)` (or use `FetchContent`).
   - Link `pulse_llm` against the `llama` target.
   - Remove `option(PULSE_LLM_STUB ON)` / set it to `OFF`.
3. Replace the body of `nativeGenerate` in `native-lib.cpp` with real `llama_*` calls. The JNI signatures and Kotlin surface in `LlamaEngine.kt` stay the same.
4. Drop a `.gguf` model into `filesDir/models/<modelId>.gguf` (e.g. via the in-app Model Manager UI, or manually with `adb push`).
5. Rebuild: `./gradlew assembleDebug`.

## Repo / branding

Pulse logo: circle outline + waveform + dot, in Tokyo Night purple (#bb9af7).

## License

Internal project. No external license attached to this source tree.
