# Pulse Android — Changelog

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
