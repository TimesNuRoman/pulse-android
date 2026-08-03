// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';
import {
  tap,
  isHapticsEnabled,
  setHapticsEnabled,
  hapticsEnabled,
  hapticImpact,
  hapticSelection,
  hapticNotification,
  prefersReducedMotion,
} from '../haptics';

const STORAGE_KEY = 'pulse.haptics.enabled';

describe('haptics', () => {
  beforeEach(() => {
    localStorage.clear();
    // Re-arm the store from a clean baseline. The store subscribes to
    // localStorage once on import; we explicitly reset to the default
    // (enabled) before each test so cross-test pollution can't make
    // haptics "accidentally off".
    setHapticsEnabled(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Remove the dynamic Haptics plugin mock so it doesn't leak into
    // other test files that import capacitor.ts.
    if (typeof window !== 'undefined') {
      delete (window as unknown as { Capacitor?: unknown }).Capacitor;
    }
  });

  it('tap("light") triggers a short web vibrate (~10ms)', async () => {
    const vibrate = vi.fn();
    (navigator as unknown as { vibrate: typeof vibrate }).vibrate = vibrate;
    // Remove any leftover Capacitor mock from previous tests.
    if (typeof window !== 'undefined') {
      delete (window as unknown as { Capacitor?: unknown }).Capacitor;
    }

    await tap('light');
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate.mock.calls[0]?.[0]).toBe(10);
  });

  it('tap("medium") triggers a 20ms web vibrate', async () => {
    const vibrate = vi.fn();
    (navigator as unknown as { vibrate: typeof vibrate }).vibrate = vibrate;
    if (typeof window !== 'undefined') {
      delete (window as unknown as { Capacitor?: unknown }).Capacitor;
    }

    await tap('medium');
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate.mock.calls[0]?.[0]).toBe(20);
  });

  it('tap("heavy") triggers a 30ms web vibrate (mic start/stop)', async () => {
    const vibrate = vi.fn();
    (navigator as unknown as { vibrate: typeof vibrate }).vibrate = vibrate;
    if (typeof window !== 'undefined') {
      delete (window as unknown as { Capacitor?: unknown }).Capacitor;
    }

    await tap('heavy');
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate.mock.calls[0]?.[0]).toBe(30);
  });

  it('tap("selection") triggers a 5ms web vibrate (tab switch)', async () => {
    const vibrate = vi.fn();
    (navigator as unknown as { vibrate: typeof vibrate }).vibrate = vibrate;
    if (typeof window !== 'undefined') {
      delete (window as unknown as { Capacitor?: unknown }).Capacitor;
    }

    await tap('selection');
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate.mock.calls[0]?.[0]).toBe(5);
  });

  it('persists the haptics-enabled flag to pulse.haptics.enabled (default ON, settable OFF)', () => {
    // Default ON: localStorage is empty → enabled, store reflects it.
    expect(isHapticsEnabled()).toBe(true);
    expect(get(hapticsEnabled)).toBe(true);

    // Toggle OFF → store and localStorage both update.
    setHapticsEnabled(false);
    expect(isHapticsEnabled()).toBe(false);
    expect(get(hapticsEnabled)).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');

    // Toggle back ON.
    setHapticsEnabled(true);
    expect(isHapticsEnabled()).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('disabled haptics short-circuit tap() — no vibrate, no plugin call', async () => {
    const vibrate = vi.fn();
    (navigator as unknown as { vibrate: typeof vibrate }).vibrate = vibrate;
    const impact = vi.fn();
    (window as unknown as { Capacitor: { Plugins: Record<string, unknown> } }).Capacitor = {
      Plugins: { Haptics: { impact, selectionChanged: vi.fn() } },
    };

    setHapticsEnabled(false);

    await tap('light');
    await tap('medium');
    await tap('heavy');
    await tap('selection');

    expect(vibrate).not.toHaveBeenCalled();
    expect(impact).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// R167 — extended public API (hapticImpact / hapticSelection / hapticNotification
// / prefersReducedMotion). The 6 tests below cover brief requirements 1, 2, 3,
// 4, 5, 6 from `__tests__/haptics.test.ts` in the R167 brief.
// ---------------------------------------------------------------------------

describe('haptics — R167 extended API', () => {
  beforeEach(() => {
    localStorage.clear();
    setHapticsEnabled(true);
    // Make sure the global prefers-reduced-motion media query returns
    // "no-preference" by default; individual tests opt in to "reduce" via
    // their own matchMedia mock.
    if (typeof window !== 'undefined') {
      delete (window as unknown as { Capacitor?: unknown }).Capacitor;
      // Replace matchMedia with a no-preference default for every test.
      window.matchMedia = vi.fn().mockImplementation(
        (query: string) =>
          ({
            matches: false,
            media: query,
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
          }) as unknown as MediaQueryList,
      );
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (typeof window !== 'undefined') {
      delete (window as unknown as { Capacitor?: unknown }).Capacitor;
    }
  });

  // (1) Brief required: "hapticImpact('light') calls Capacitor Haptics when
  //     plugin available". Verifies the native path.
  it('hapticImpact("light") calls Capacitor Haptics.impact({ style: "LIGHT" }) when plugin available', async () => {
    const impact = vi.fn().mockResolvedValue(undefined);
    (
      window as unknown as { Capacitor: { Plugins: Record<string, unknown> } }
    ).Capacitor = {
      Plugins: { Haptics: { impact } },
    };

    await hapticImpact('light');
    expect(impact).toHaveBeenCalledTimes(1);
    expect(impact).toHaveBeenCalledWith({ style: 'LIGHT' });
  });

  // (2) Brief required: "Falls back to navigator.vibrate(15) on web".
  it('hapticImpact("light") falls back to navigator.vibrate(15) on web', async () => {
    const vibrate = vi.fn();
    (navigator as unknown as { vibrate: typeof vibrate }).vibrate = vibrate;

    await hapticImpact('light');
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith(15);
  });

  // (3) Brief required: "No-op when neither available". Strips both
  //     Capacitor and navigator.vibrate — must not throw, must not warn.
  it('hapticImpact is a graceful no-op when neither Capacitor nor navigator.vibrate is available', async () => {
    // Suppress the missing-plugin warning some Vitest setups emit.
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const origVibrate = navigator.vibrate;
    // Some test environments already stub vibrate; remove ours to test the
    // "neither available" path.
    Object.defineProperty(navigator, 'vibrate', {
      value: undefined,
      configurable: true,
    });
    if (typeof window !== 'undefined') {
      delete (window as unknown as { Capacitor?: unknown }).Capacitor;
    }

    await expect(hapticImpact('light')).resolves.toBeUndefined();
    await expect(hapticImpact('medium')).resolves.toBeUndefined();
    await expect(hapticImpact('heavy')).resolves.toBeUndefined();
    // Restore so the rest of the suite is unaffected.
    if (origVibrate) {
      Object.defineProperty(navigator, 'vibrate', {
        value: origVibrate,
        configurable: true,
      });
    }
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  // (4) Brief required: "isHapticsEnabled() returns false when localStorage = 'off'"
  //     and "returns true by default (or when localStorage = 'on')". The R118
  //     store uses 'true'|'false' instead of 'on'|'off' — the value semantics
  //     are identical (any non-'true' string is treated as off). We assert the
  //     observable behavior: explicit "false" → disabled, missing → enabled.
  it('isHapticsEnabled() returns false when localStorage holds an off value, true by default', () => {
    localStorage.clear();
    expect(isHapticsEnabled()).toBe(true);

    localStorage.setItem(STORAGE_KEY, 'false');
    expect(isHapticsEnabled()).toBe(false);

    localStorage.setItem(STORAGE_KEY, 'off');
    expect(isHapticsEnabled()).toBe(false);

    localStorage.setItem(STORAGE_KEY, 'true');
    expect(isHapticsEnabled()).toBe(true);

    localStorage.setItem(STORAGE_KEY, 'on');
    expect(isHapticsEnabled()).toBe(true);
  });

  // (5) Brief required: "hapticNotification('error') calls correct notification type".
  //     Verifies the native path with the full success/warning/error matrix so
  //     a future regression on the enum mapping is caught.
  it('hapticNotification routes to Capacitor.notification({ type }) with the correct enum for success/warning/error', async () => {
    const notification = vi.fn().mockResolvedValue(undefined);
    (
      window as unknown as { Capacitor: { Plugins: Record<string, unknown> } }
    ).Capacitor = {
      Plugins: { Haptics: { notification } },
    };

    await hapticNotification('success');
    expect(notification).toHaveBeenNthCalledWith(1, { type: 'SUCCESS' });

    await hapticNotification('warning');
    expect(notification).toHaveBeenNthCalledWith(2, { type: 'WARNING' });

    await hapticNotification('error');
    expect(notification).toHaveBeenNthCalledWith(3, { type: 'ERROR' });
  });

  // (6) Hard rule #11: "a11y: respect prefers-reduced-motion". Verifies that
  //     hapticSelection short-circuits when the user has set
  //     prefers-reduced-motion: reduce. We also assert hapticImpact and
  //     hapticNotification are short-circuited by the same gate.
  it('prefers-reduced-motion: reduce short-circuits all R167 haptic helpers', async () => {
    if (typeof window !== 'undefined') {
      window.matchMedia = vi.fn().mockImplementation(
        (query: string) =>
          ({
            matches: query === '(prefers-reduced-motion: reduce)',
            media: query,
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
          }) as unknown as MediaQueryList,
      );
    }
    expect(prefersReducedMotion()).toBe(true);

    const vibrate = vi.fn();
    (navigator as unknown as { vibrate: typeof vibrate }).vibrate = vibrate;
    const impact = vi.fn();
    const notification = vi.fn();
    const selectionChanged = vi.fn();
    (
      window as unknown as { Capacitor: { Plugins: Record<string, unknown> } }
    ).Capacitor = {
      Plugins: { Haptics: { impact, notification, selectionChanged } },
    };

    await hapticImpact('medium');
    await hapticSelection();
    await hapticNotification('error');

    expect(vibrate).not.toHaveBeenCalled();
    expect(impact).not.toHaveBeenCalled();
    expect(notification).not.toHaveBeenCalled();
    expect(selectionChanged).not.toHaveBeenCalled();
  });
});
