# Pulse Android — Changelog

## [0.6.7] — R117 polish release — 2026-08-02

### R103 polish — P1 #2 voice input

- Mic button is **disabled** (not just visually muted) when there is no
  active note open; tap does nothing. P1#2 P2 follow-up to the R102 wire-up.
- `SpeechRecognition.stop()` is called on `onDestroy` to clean up the
  Capacitor listener; no more leaked listeners when navigating away from a
  note mid-recognition.
- See commit `1b4abe6` (P1 #2 P2 polish).

### R103 — UpdateChecker chain extension (v0.6.5/6 users auto-update)

- The R102 (v0.6.6 public deploy) host is now at the head of the chain:
  `ncfosklh79sxf.space.minimax.io`. Without this, v0.6.5/6 users kept
  polling R92 and saw "you're up to date" forever.
- Chain grew from 7 → 8 entries; R102 is index 0, R92 (v0.6.5) is index 1,
  R90 (v0.6.4) is index 2, R88 (v0.6.3) is index 3.
- See commit `c836ff8` (R103 update-checker chain).

### P1 trio (carried over from v0.6.6 prep)

All three P1 fixes from the v0.6.6 audit are in this release:

- **P1 #1** — `ac77e40` — `android:dataExtractionRules` + `fullBackupContent`
  exclude `app_webview` (Capacitor store) from cloud-backup and
  device-transfer. Closes the silent-WebView-in-backup regression.
- **P1 #2** — `97fa474` + `1b4abe6` — `SpeechRecognition` wired into the
  `NoteToolbar` mic button; P2 polish disables the button without an active
  note and stops the listener on destroy.
- **P1 #3** — `a07a22f` — `SettingsView` (Profile / Theme / About / Actions)
  reachable from the drawer; closes the missing-settings gap.

### Tests

- 322/322 vitest (was 304/304 at v0.6.6, +18 across P1/R103).
- New test in `update-checker.test.ts` pins v0.6.7/17 + R102 chain head.
- `gradleReleaseConfig.test.ts` version assertions bumped to 0.6.7/17.

### Build

- `web/dist/`: vite build (260 modules, ~5s).
- `cap sync android` — syncs web assets into `android/app/src/src/main/assets/public/`.
- `gradlew.bat assembleRelease` — full release build (incremental 14s on
  warm daemon), v2+v3 signing (R93b keystore).

### APK

```
android/app/build/outputs/apk/release/app-release.apk
size:    1.29 MB (1,352,929 bytes)
sha256:  39656F6C533016E7E6CF26210E81A09805ADE0E17E8B88107887082DB03468D8
versionName: 0.6.7
versionCode: 17
signing:     v2 + v3 (v1 disabled, R95a; v2 true, v3 true)
signer DN:   CN=Pulse Notes, OU=Pulse, O=Lesside, L=Brest, ST=Brest, C=BY
signer SHA-256: fdbd5f612943d641c899809bc13985c2ad1238538d6b6eccc41e0e795007bfef (R93b)
minSdk:      24
targetSdk:   36
```

### Deploy (R103 chain)

- **APK canonical**: TBD (added at R118 deploy time)
- **Manifest (R102 head)**: https://ncfosklh79sxf.space.minimax.io/android.json
- **Chain order** (R103, head → tail):
  1. https://ncfosklh79sxf.space.minimax.io/android.json (R102, v0.6.6)
  2. https://yv5eeknt6h6sa.space.minimax.io/android.json (R92,  v0.6.5)
  3. https://ad67rp710vsl7.space.minimax.io/android.json (R90,  v0.6.4)
  4. https://32dhrw35m4x2v.space.minimax.io/android.json (R88,  v0.6.3)
  5. https://7n8sb1bsnx9h.space.minimax.io/android.json  (R86,  v0.6.2)
  6. https://wztgxiy1eu29i.space.minimax.io/android.json (R81,  v0.6.1)
  7. https://813khigmhk9k8.space.minimax.io/android.json (R78,  v0.6.0)
  8. https://9c3f928.space.minimax.io/android.json       (R74,  v0.5.x)

## [0.6.2] — R84 onboarding v2 — 2026-08-01

### Onboarding v2 — 4 screens

Первый запуск теперь показывает 4 экрана онбординга вместо 3 из R46.
Onboarding пропускается при повторных запусках через `localStorage["pulse.notes.onboarded"]`.

1. **Welcome** — иконка приложения (Tokyo Night P+spark inline SVG), заголовок, версия + размер + лицензия, CTA `Get started`.
2. **Capture** — share-intent flow: 3-карточный SVG mockup (share sheet → Pulse entry → saved note), CTA `Continue`, skip в углу.
3. **Smart Engine v3** — anchor в R79/R82 метриках: `+32% pass-rate · 0.85ms p50 parse · threshold 5/7`, footnote про tree-sitter.
4. **Local-first** — lock-icon SVG (НЕ emoji), 3 promise-item (on-device, E2E sync opt-in, zero telemetry), CTA `Start writing`, footer с Apache 2.0.

### Архитектура

- `web/src/components/onboarding/onboardingStore.ts` — Svelte 5 runes-based store + localStorage persistence.
- `web/src/components/onboarding/ProgressDots.svelte` — 4 dots, 8dp inactive / 24dp active (M3 spec), 48dp touch target via `::before` hit-area.
- `web/src/components/onboarding/OnboardingFlow.svelte` — main flow с 200ms slide transitions (cubic-bezier(0.4, 0, 0.2, 1)), `prefers-reduced-motion` respected, hapticImpact on screen changes.
- `web/src/App.svelte` — gates `<NotesView />` за `<OnboardingFlow />` пока `readPersistedCompleted() === false`.

### Anti-emoji

Roman's hard rule (R82b поймал 13+ emoji в R80 site). В R84:

- **0 emoji** во всех 7 onboarding source-файлах.
- **0 emoji** в rendered DOM всех 4 экранов + всего flow.
- `__tests__/anti-emoji.test.ts` (6 tests) — сканирует source regex'ом U+1F000–U+1FAFF + U+2600–U+27BF + U+FE0F + U+200D, и rendered DOM через `container.textContent`. Падает громко если emoji появится в R85+.

### Tests

- 184/184 vitest (was 150/150 in R77 GREENFIELD).
- +34 new tests: 12 store + 6 ProgressDots + 10 OnboardingFlow + 6 anti-emoji.
- 13 test files (was 9).

### Build

- `web/dist/`: 252 modules, 4.55s, 0 errors.
- CSS: 22.73 kB (+5 KB от R77, новые стили онбординга).
- Main JS: 122.34 kB (+12 KB).
- Gradle `assembleDebug` 35s, JDK 21 pinned.

### APK

```
android/app/build/outputs/apk/debug/app-debug.apk
size:  4.34 МБ (4,551,289 байт; +5,616 байт от R81 v0.6.1)
sha256: 2F8BB21841763705C34FDA9DE1281A75029D524AB212F55E48C6BD7A9A288F60
versionName: 0.6.2
versionCode: 12
```

### Deploy

- **APK canonical**: https://wztgxiy1eu29i.space.minimax.io/pulse-notes-0.6.2-debug.apk
- **Manifest**: https://5andw6pfkum5u.space.minimax.io/android.json
- **Landing page**: https://wztgxiy1eu29i.space.minimax.io
- **R81 site canonical** (813khigmhk9k8) + 2 alts (j4gavu2tugfco, sw7zq2mfjfy5r) — показывают v0.6.1, R86 site-followup обновит до 0.6.2.

## [0.2.0] — mobile-iteration 17 — 2026-07-30

### Создано с нуля

- `pulse-android/` — отдельный Capacitor 8 проект (не потеряется, как старый `pulse-mobile/`).
  - `package.json` с фиксированными версиями 5 плагинов Capacitor.
  - `capacitor.config.json` (используем `.json`, не `.ts` — Capacitor 8 CLI + Node 22+ не дружат с `require.extensions[.ts]`).
  - `www/` — копия свежего web bundle (Pulse UI, не Habr-only).
  - `android/` — `cap add android` → AGP 8.13, compileSdk 36, sourceCompatibility 21.
  - `android/local.properties` с `sdk.dir=C:\Users\1\AppData\Local\Android\Sdk`.
  - `README.md` (этот файл) + `CHANGELOG.md` + `../research/android-iteration-17.md`.

### Mobile-UX улучшения в web коде (4 новых)

1. **Onboarding screen** (`src/mobile/Onboarding.tsx`).
   - Показывается при первом запуске на mobile (Capacitor WebView) — `localStorage[pulse.onboarding.done]`.
   - 3 шага: Welcome → Ollama (где скачать) → Готово.
   - Пропустить / Назад / Поехали. Touch-friendly кнопки 44px+.

2. **Pull-to-refresh** (`src/mobile/usePullToRefresh.tsx`).
   - Хук с touch-детектом, резиновый pull (resistance 0.45), порог 60px.
   - Подключён в `HabrSearch` и `WebSearchView` — повторяет последний запрос.
   - Минимум 600мс спиннер (чтобы не мигало).

3. **Theme picker** (`src/mobile/theme.ts`).
   - Dark / Light / System (по умолчанию Dark).
   - `data-theme` на `<html>` через `applyTheme()`.
   - Добавлен в `SettingsView` (новая секция «Тема оформления»).
   - Light theme: светлый фон, тёмный текст, переопределения 20+ CSS переменных.

4. **Safe-area top** + мобильный header:
   - `padding-top: env(safe-area-inset-top)` на `.app__header` и `.app__main` в mobile media query.
   - Чтобы контент не уезжал под Android cutout / iOS notch.

5. **About / version в Settings** (бонус):
   - Версия Pulse, runtime detection (desktop / mobile / web), ссылка на Ollama + Play Store, кнопка «Показать onboarding заново» (на mobile).

### Desktop Tauri — НЕ тронут

- `data-theme` НЕ ставится на desktop (только если юзер сам выберет через Settings, но Settings на desktop не показывается на mobile nav).
- Pull-to-refresh — `HAS_TOUCH` гард, на desktop мыши не сработает.
- Onboarding — `IS_MOBILE` гард, на desktop не показывается.
- Все стили mobile — внутри `@media (max-width: 767px)`.

### Что попало в APK

```
android/app/build/outputs/apk/debug/app-debug.apk
size:  4.19 МБ (4,390,940 байт)
sha256: A522151A1D55D576D1B1410F84A578C120DF3031C86B7FFB9BA4E9C3D8A3E9D0
```

Структура:
- `classes.dex` × 9 (основной код + Capacitor + 5 плагинов).
- `assets/public/` — web bundle (`index.html` + 5 JS чанков + CSS + icon).
- `res/`, `META-INF/`, `AndroidManifest.xml`, `resources.arsc`.

### Build

- `JAVA_HOME=C:\Program Files\Java\jdk-21\jdk-21.0.12+8`
- `ANDROID_HOME=C:\Users\1\AppData\Local\Android\Sdk`
- `./gradlew.bat assembleDebug --no-daemon` → **BUILD SUCCESSFUL in 38s**

### Известные ограничения (для следующих итераций)

- Debug-сборка без native libs → только x86_64 emulator (на устройстве arm64-v8a пойдёт через WebView system libs). Release build упакует нативные библиотеки и будет ~10-15 МБ.
- Нет RECORD_AUDIO permission — STT работает только через Web Speech API (может не работать в Capacitor WebView на Android; для надёжного STT → `@capacitor-community/speech-recognition`).
- Нет `@capacitor/splash-screen` в plugins install list — есть в `package.json`, но не был добавлен в cap.config до build. (Исправлено в этой итерации, фактически подключён.)
- Splash screen показывает только launch; в theme мы только просим backgroundColor.
