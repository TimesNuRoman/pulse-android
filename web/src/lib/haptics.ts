// SPDX-License-Identifier: Apache-2.0
/**
 * Haptics wrapper.
 *
 * R118 — entry point for every haptic tap the app fires. Sits on top of the
 * `hapticImpact` shim in `capacitor.ts` and adds:
 *   - 4 named styles: `light`, `medium`, `heavy`, `selection` (R118 brief).
 *   - a user-facing `pulse.haptics.enabled` setting (default ON, persisted
 *     to localStorage). When disabled, every `tap()` is a no-op.
 *   - a `selectionChanged()` codepath for tab switches.
 *
 * R167 — extends the public surface with three new helpers that call sites
 * in notesStore, NotesView, and future ChatInput use:
 *   - `hapticImpact(style)` — 'light' | 'medium' | 'heavy' (15/25/40ms web).
 *   - `hapticSelection()`   — 10ms web / `selectionChanged()` native.
 *   - `hapticNotification(type)` — 'success' | 'warning' | 'error' (30/40/50ms
 *     web / `notification({type})` native).
 *   - `prefersReducedMotion()` — a11y guard (hard rule #11). All R167 helpers
 *     short-circuit when the user has `prefers-reduced-motion: reduce`.
 *
 * We keep the existing `hapticImpact` shim in capacitor.ts untouched so the
 * R95 audit invariants (dark-only, 44dp touch, Apache-2.0, no marketing
 * fluff) and the R102/R103 call sites keep working.
 *
 * @capacitor/haptics is NOT in package.json today (verified R167). The
 * native path therefore resolves via `window.Capacitor?.Plugins?.Haptics`,
 * which Capacitor injects at runtime on Android. The brief's
 * `await import('@capacitor/haptics')` upgrade path is documented in the
 * R167 report; switching to it is a one-file change once the package lands.
 */
import { writable, type Writable } from 'svelte/store';
// R118 — legacy shim from capacitor.ts. Aliased on import because R167
// adds a public `hapticImpact(style)` helper further down; calling
// sites inside R118's `tap()` still need the legacy object-shape shim.
import { hapticImpact as legacyHapticImpact } from './capacitor';

export type HapticStyle = 'light' | 'medium' | 'heavy' | 'selection';

const HAPTICS_STORAGE_KEY = 'pulse.haptics.enabled';
const DEFAULT_ENABLED = true;

/** Pattern table for the web fallback (`navigator.vibrate(ms)`). */
const WEB_VIBRATE_MS: Record<HapticStyle, number> = {
  light: 10,
  medium: 20,
  heavy: 30,
  selection: 5,
};

interface HapticsPluginShape {
  impact?: (o: { style: string }) => Promise<void>;
  notification?: (o: { type: string }) => Promise<void>;
  selectionChanged?: () => Promise<void>;
  selectionStart?: () => Promise<void>;
  selectionEnd?: () => Promise<void>;
}

function getHapticsPlugin(): HapticsPluginShape | null {
  if (typeof window === 'undefined') return null;
  return (window.Capacitor?.Plugins?.['Haptics'] as HapticsPluginShape | undefined) ?? null;
}

function loadInitialEnabled(): boolean {
  if (typeof localStorage === 'undefined') return DEFAULT_ENABLED;
  try {
    const raw = localStorage.getItem(HAPTICS_STORAGE_KEY);
    if (raw === null) return DEFAULT_ENABLED;
    // R167 — accept both 'true' (R118) and 'on' (R167 brief) as enabled.
    // Any other value (including 'false', 'off', '', '0') is treated as off.
    return raw === 'true' || raw === 'on';
  } catch {
    return DEFAULT_ENABLED;
  }
}

function writePersistedEnabled(value: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(HAPTICS_STORAGE_KEY, value ? 'true' : 'false');
  } catch {
    // quota / private mode — swallow
  }
}

/**
 * Live haptics-enabled flag. Subscribe to it in Svelte components to
 * react to settings changes (Settings → Haptics toggle).
 */
export const hapticsEnabled: Writable<boolean> = writable<boolean>(loadInitialEnabled());

// Persist on every change. Same shape as settingStore: the first call
// (from the initial subscribe) just re-writes whatever we already loaded —
// harmless and keeps the implementation symmetric.
hapticsEnabled.subscribe((value) => {
  writePersistedEnabled(value);
});

/** Read the persisted flag without going through the store. */
export function isHapticsEnabled(): boolean {
  if (typeof localStorage === 'undefined') return DEFAULT_ENABLED;
  try {
    const raw = localStorage.getItem(HAPTICS_STORAGE_KEY);
    if (raw === null) return DEFAULT_ENABLED;
    // R167 — accept both 'true' (R118) and 'on' (R167 brief) as enabled.
    return raw === 'true' || raw === 'on';
  } catch {
    return DEFAULT_ENABLED;
  }
}

/** Persist + broadcast a new value. */
export function setHapticsEnabled(value: boolean): void {
  hapticsEnabled.set(Boolean(value));
}

const IMPACT_STYLE: Record<'light' | 'medium' | 'heavy', 'light' | 'medium' | 'heavy'> = {
  light: 'light',
  medium: 'medium',
  heavy: 'heavy',
};

/**
 * Fire a single haptic tap of the given style. No-op if the user has
 * disabled haptics in Settings, or if no plugin/web vibrate is available.
 *
 * Always returns a resolved promise so callers can `void` it without
 * leaking unhandled rejections.
 */
export async function tap(style: HapticStyle): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!isHapticsEnabled()) return;

  const plugin = getHapticsPlugin();

  // Native: prefer the most semantically accurate API per style.
  if (plugin) {
    if (style === 'selection') {
      if (plugin.selectionChanged) {
        await plugin.selectionChanged();
        return;
      }
      if (plugin.selectionStart) {
        await plugin.selectionStart();
        return;
      }
      // No selection* API — degrade to a light impact.
      if (plugin.impact) {
        await plugin.impact({ style: 'LIGHT' });
        return;
      }
    } else {
      if (plugin.impact) {
        await plugin.impact({ style: IMPACT_STYLE[style].toUpperCase() });
        return;
      }
    }
  }

  // Web fallback: navigator.vibrate. The 4 styles are different durations
  // so the user can perceive a hierarchy even on devices without a taptic
  // engine (laptops with weak ERM vibrators).
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(WEB_VIBRATE_MS[style]);
    } catch {
      // some browsers throw if the page hasn't been interacted with yet
    }
    return;
  }

  // Final fallback: route through the existing shim, which already handles
  // navigator.vibrate for us. This keeps the legacy call sites on the
  // same codepath and means a one-line future swap to a different
  // implementation is enough.
  if (style === 'selection') {
    await legacyHapticImpact({ light: true });
  } else {
    await legacyHapticImpact(IMPACT_STYLE[style]);
  }
}

// ---------------------------------------------------------------------------
// R167 — extended public API
// ---------------------------------------------------------------------------

/** R167 — public style union for the new `hapticImpact()` helper. */
export type R167ImpactStyle = 'light' | 'medium' | 'heavy';

/** R167 — public notification type union. */
export type R167NotificationType = 'success' | 'warning' | 'error';

/** R167 — web fallback durations for impact styles. */
const IMPACT_VIBRATE_MS: Record<R167ImpactStyle, number> = {
  light: 15,
  medium: 25,
  heavy: 40,
};

/** R167 — native Capacitor `Haptics.impact({ style })` enum. */
const IMPACT_NATIVE_STYLE: Record<R167ImpactStyle, string> = {
  light: 'LIGHT',
  medium: 'MEDIUM',
  heavy: 'HEAVY',
};

/** R167 — web fallback durations for notification types. */
const NOTIFICATION_VIBRATE_MS: Record<R167NotificationType, number> = {
  success: 30,
  warning: 40,
  error: 50,
};

/** R167 — native Capacitor `Haptics.notification({ type })` enum. */
const NOTIFICATION_NATIVE_TYPE: Record<R167NotificationType, string> = {
  success: 'SUCCESS',
  warning: 'WARNING',
  error: 'ERROR',
};

/** R167 — single 10ms web tick for selection. */
const SELECTION_VIBRATE_MS = 10;

/**
 * R167 a11y guard (hard rule #11). Returns true when the user has expressed
 * `prefers-reduced-motion: reduce` in their OS settings. Haptic feedback is a
 * form of motion; we skip it for those users.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * R167 shared pre-flight. Returns true only when:
 *   - the user has haptics enabled in Settings, AND
 *   - the user has NOT expressed `prefers-reduced-motion: reduce`.
 * All three R167 helpers route through this gate so the behavior is
 * symmetric and easy to reason about.
 */
function shouldFireHaptic(): boolean {
  if (typeof window === 'undefined') return false;
  if (!isHapticsEnabled()) return false;
  if (prefersReducedMotion()) return false;
  return true;
}

/**
 * R167 — best-effort `navigator.vibrate(ms)` wrapper. Swallows the
 * "user-gesture-required" rejection some browsers throw before any
 * interaction has happened.
 */
function webVibrate(ms: number): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(ms);
  } catch {
    // user gesture not yet given
  }
}

/**
 * R167 — single impact tap. Native path uses `Haptics.impact({ style })`
 * with the 'LIGHT' | 'MEDIUM' | 'HEAVY' enum; web path falls back to
 * `navigator.vibrate(15 | 25 | 40)`. No-op when disabled or when
 * `prefers-reduced-motion: reduce` is set.
 */
export async function hapticImpact(style: R167ImpactStyle): Promise<void> {
  if (!shouldFireHaptic()) return;
  const plugin = getHapticsPlugin();
  if (plugin?.impact) {
    try {
      await plugin.impact({ style: IMPACT_NATIVE_STYLE[style] });
      return;
    } catch {
      // plugin threw — fall through to web vibrate
    }
  }
  webVibrate(IMPACT_VIBRATE_MS[style]);
}

/**
 * R167 — short selection tick (tab switch, dropdown open/close). Native
 * path prefers `Haptics.selectionChanged()`; web path is a 10ms tick.
 * No-op when disabled or `prefers-reduced-motion: reduce`.
 */
export async function hapticSelection(): Promise<void> {
  if (!shouldFireHaptic()) return;
  const plugin = getHapticsPlugin();
  if (plugin?.selectionChanged) {
    try {
      await plugin.selectionChanged();
      return;
    } catch {
      // fall through
    }
  }
  webVibrate(SELECTION_VIBRATE_MS);
}

/**
 * R167 — notification feedback (success / warning / error). Native path
 * uses `Haptics.notification({ type })` with 'SUCCESS' | 'WARNING' | 'ERROR';
 * web path falls back to `navigator.vibrate(30 | 40 | 50)`. No-op when
 * disabled or `prefers-reduced-motion: reduce`.
 */
export async function hapticNotification(type: R167NotificationType): Promise<void> {
  if (!shouldFireHaptic()) return;
  const plugin = getHapticsPlugin();
  if (plugin?.notification) {
    try {
      await plugin.notification({ type: NOTIFICATION_NATIVE_TYPE[type] });
      return;
    } catch {
      // fall through
    }
  }
  webVibrate(NOTIFICATION_VIBRATE_MS[type]);
}
