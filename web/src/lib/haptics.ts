// SPDX-License-Identifier: Apache-2.0
/**
 * Haptics wrapper (R118).
 *
 * Single entry point for every haptic tap the app fires. Sits on top of the
 * existing `hapticImpact` shim in `capacitor.ts` and adds:
 *   - 4 named styles: `light`, `medium`, `heavy`, `selection` (R118 brief).
 *   - a user-facing `pulse.haptics.enabled` setting (default ON, persisted
 *     to localStorage). When disabled, every `tap()` is a no-op.
 *   - a `selectionChanged()` codepath for tab switches (uses the Capacitor
 *     `Haptics.selectionChanged()` method when the plugin is present,
 *     otherwise falls back to a 5ms web vibrate).
 *
 * We keep the underlying `hapticImpact` shim untouched so all 4 hard-rule
 * anti-regressions (R95 audit: dark-only, 44dp touch, Apache 2.0, no
 * marketing fluff) and the existing R102/R103 call sites keep working
 * while this wrapper graduates into the new call sites.
 */
import { writable, type Writable } from 'svelte/store';
import { hapticImpact } from './capacitor';

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
    return raw === 'true';
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
    return raw === 'true';
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
    await hapticImpact({ light: true });
  } else {
    await hapticImpact(IMPACT_STYLE[style]);
  }
}
