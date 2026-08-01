# Pulse Notes — Android (Capacitor 8 wrapper)

Pulse Notes — markdown editor built for Android from scratch (Svelte 5 + TypeScript + CodeMirror 6).
Этот проект — Android-итерация: Capacitor 8 оборачивает тот же web bundle, что используется
в `pulse-desktop` (Tauri v2) и публикуется через `pulse-landing`.

## Структура

```
pulse-android/
├── capacitor.config.json    # Capacitor 8 config (appId, plugins)
├── package.json             # @capacitor/{core,cli,android,app,...}
├── www/                     # ← копия web bundle (см. build)
└── android/                 # нативный Android-проект (создаётся cap add)
```

**App ID**: `app.pulse.notes` (see `android/app/build.gradle` and `capacitor.config.json`).
**App name**: `Pulse Notes` (see `android/app/src/main/res/values/strings.xml`).
**License**: Apache 2.0 — see `LICENSE` at the repo root.

## Как пересобрать

### 0. Один раз: поставить Capacitor CLI и deps

```powershell
cd C:\Users\1\.minimax-agent\projects\pulse-android
npm install
```

(Зависимости уже зафиксированы в `package-lock.json` — повторно ставить не нужно.)

### 1. Перебилдить web (pulse-desktop)

```powershell
cd C:\Users\1\.minimax-agent\projects\pulse-desktop
npm run build     # tsc -b && vite build → web/dist
```

### 2. Скопировать bundle в `pulse-android/www`

```powershell
Remove-Item "C:\Users\1\.minimax-agent\projects\pulse-android\www\*" -Recurse -Force
Copy-Item -Path "C:\Users\1\.minimax-agent\projects\pulse-desktop\web\dist\*" `
          -Destination "C:\Users\1\.minimax-agent\projects\pulse-android\www\" -Recurse -Force
```

### 3. Sync native проект

```powershell
cd C:\Users\1\.minimax-agent\projects\pulse-android
npx cap sync android
```

Это копирует `www/` в `android/app/src/main/assets/public/` и обновляет плагин-список.

### 4. Собрать APK

```powershell
cd "C:\Users\1\.minimax-agent\projects\pulse-android\android"
$env:JAVA_HOME = "C:\Program Files\Java\jdk-21\jdk-21.0.12+8"
$env:ANDROID_HOME = "C:\Users\1\AppData\Local\Android\Sdk"
.\gradlew.bat assembleDebug
```

APK появится в:
```
android\app\build\outputs\apk\debug\app-debug.apk
```

### 5. Скопировать в целевые папки

```powershell
Copy-Item "android\app\build\outputs\apk\debug\app-debug.apk" `
          "H:\Вайбкодинг\projects\pulse-mobile\app-debug.apk" -Force
Copy-Item "android\app\build\outputs\apk\debug\app-debug.apk" `
          "C:\Users\1\.minimax\workspace\downloads\app-debug.apk" -Force
```

## Все одной командой

```powershell
cd C:\Users\1\.minimax-agent\projects\pulse-desktop; npm run build; `
  Copy-Item -Path "web\dist\*" -Destination "C:\Users\1\.minimax-agent\projects\pulse-android\www\" -Recurse -Force; `
  Set-Location "C:\Users\1\.minimax-agent\projects\pulse-android"; `
  $env:JAVA_HOME = "C:\Program Files\Java\jdk-21\jdk-21.0.12+8"; `
  npx cap sync android; `
  Set-Location "android"; .\gradlew.bat assembleDebug
```

## Capacitor plugins (5)

| Plugin | Что делает |
|---|---|
| `@capacitor/app` (8.1.1) | Back button handler (Android), lifecycle |
| `@capacitor/haptics` (8.0.2) | Тактильный фидбек (можно повесить на mic/refresh) |
| `@capacitor/keyboard` (8.0.5) | Keyboard show/hide → CSS var `--kbd-h` (сдвигает input над клавой) |
| `@capacitor/splash-screen` (8.0.2) | Launch splash (1a1b26, 600мс) |
| `@capacitor/status-bar` (8.0.3) | Тёмный status bar в цвет фона |

Все плагины нативно подключены через `capacitor.build.gradle`.

## Как добавить новый Capacitor плагин

```powershell
cd C:\Users\1\.minimax-agent\projects\pulse-android
npm install @capacitor/<name>
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```

JS-импорт делается **только** на mobile (см. `src/api.ts` → `getCapacitor*` хелперы с проверкой `IN_CAPACITOR`). На desktop Tauri WebView они просто не подгрузятся.

## Permissions

`AndroidManifest.xml`:
- `android.permission.INTERNET` — для fetch к Ollama API и habr-search.

Нужны ещё (не добавлены, добавлять по необходимости):
- `RECORD_AUDIO` — для STT (voice input через Capacitor Speech Recognition).
- `CAMERA` — для Capacitor Camera (уже есть в `app.pulse.local`).
- `MODIFY_AUDIO_SETTINGS` — для `@capacitor/haptics` НЕ нужен.

## Ограничения

- **JDK 21** обязательно (Capacitor 8 + AGP 8.13 → `sourceCompatibility VERSION_21`). JDK 17 не подойдёт, JDK 25 не подойдёт (Gradle 8.13 не парсит class version 69).
- **ANDROID_HOME** должен указывать на рабочий SDK. Сейчас `C:\Users\1\AppData\Local\Android\Sdk` (см. `android/local.properties`).
- Debug-сборка ~4 МБ (только arm64-v8a; release с native libs будет ~10-15 МБ).

## Desktop Tauri не сломан

Все mobile-улучшения изолированы:
- `src/mobile/*.ts(x)` — отдельная папка, не импортируется из desktop-путей.
- `IS_MOBILE` / `IS_DESKTOP` флаги уже работают в `src/api.ts`.
- Mobile-only CSS под `@media (max-width: 767px)`.
- `data-theme` на `<html>` ставится через `applyTheme()`, на десктопе по умолчанию dark.
