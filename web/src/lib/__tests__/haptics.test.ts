// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';
import {
  tap,
  isHapticsEnabled,
  setHapticsEnabled,
  hapticsEnabled,
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
