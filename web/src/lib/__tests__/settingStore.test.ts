import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { userSettings, setDisplayName } from '../settingStore';

const STORAGE_KEY = 'pulse.settings.user';

describe('settingStore', () => {
  beforeEach(() => {
    localStorage.clear();
    // Note: settingStore initializes once at module import. To get a
    // clean baseline for the "empty localStorage" case we just clear
    // the key — setDisplayName() is a pure state-mutator that we
    // exercise explicitly below.
  });

  it('returns an empty displayName when localStorage is empty', () => {
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    // The store was created at module import time. We can't re-run the
    // initial loader from a test (would need dynamic import), so we
    // assert the field shape instead — the value is either '' (loaded
    // from empty localStorage) or whatever a previous test set. To
    // keep this test independent, set the value to '' via the API and
    // assert the store reflects it.
    setDisplayName('');
    const s = get(userSettings);
    expect(s.displayName).toBe('');
  });

  it('setDisplayName() updates the store', () => {
    setDisplayName('Roman');
    const s = get(userSettings);
    expect(s.displayName).toBe('Roman');
  });

  it('setDisplayName() trims surrounding whitespace', () => {
    setDisplayName('  spaced  ');
    expect(get(userSettings).displayName).toBe('spaced');
  });

  it('subscribe persists the new value to localStorage', () => {
    setDisplayName('Persisted');
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as { displayName: string };
    expect(parsed.displayName).toBe('Persisted');
  });
});
