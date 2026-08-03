// R166 — Web splash overlay helper.
//
// Capacitor's native @capacitor/splash-screen covers Android (the dark
// splash.png + M3 SplashScreen windowSplashScreenAnimatedIcon). On a
// plain browser preview or on the Capacitor WebView before the native
// plugin hides, the web bundle shows a brief white flash. The
// `<div id="web-splash">` element in index.html is the in-bundle
// counterpart: dark Tokyo Night background, centered mark + "Pulse"
// wordmark, dismissed after DISMISS_MS or on the first
// `pulse-app-ready` event (whichever fires first).
//
// This module owns the DOM lookup + dismiss animation. main.ts calls
// `setupAutoDismiss()` once at startup. Tests fake the timers to
// verify the 1500ms auto-dismiss without waiting for real time.

const SPLASH_ID = 'web-splash';
const HIDDEN_CLASS = 'web-splash--hidden';
export const SPLASH_DISMISS_MS = 1500;
const FADE_OUT_MS = 300;

export function getSplash(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.getElementById(SPLASH_ID);
}

export function dismissSplash(): void {
  if (typeof document === 'undefined') return;
  const splash = getSplash();
  if (!splash) return;
  if (splash.classList.contains(HIDDEN_CLASS)) return;
  splash.classList.add(HIDDEN_CLASS);
  // After the CSS transition, remove the element so it doesn't
  // intercept clicks. The timer is fire-and-forget; if the page
  // navigates before the cleanup runs the element is GC'd with the
  // document.
  window.setTimeout(() => splash.remove(), FADE_OUT_MS);
}

export function setupAutoDismiss(): void {
  if (typeof window === 'undefined') return;
  const timer = window.setTimeout(dismissSplash, SPLASH_DISMISS_MS);
  // If the app signals readiness earlier than 1500ms, dismiss then.
  // { once: true } so the listener self-detaches after firing.
  window.addEventListener(
    'pulse-app-ready',
    () => {
      window.clearTimeout(timer);
      dismissSplash();
    },
    { once: true },
  );
}
