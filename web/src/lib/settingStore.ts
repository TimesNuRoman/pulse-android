/**
 * User-facing settings store (v0.6.6, P1 #3 from R95 audit).
 *
 * Holds display-name and other lightweight profile data that we persist to
 * localStorage and surface in the Settings view. Intentionally tiny — we
 * don't store anything that should live in Capacitor Preferences yet.
 *
 * Persistence pattern matches notesStore / onboardingStore: load on init,
 * subscribe to write through, swallow storage errors (quota / private mode).
 */
import { writable } from 'svelte/store';

const STORAGE_KEY = 'pulse.settings.user';
const DISPLAY_NAME_MAX = 32;

export interface UserSettings {
  displayName: string;
}

function loadInitial(): UserSettings {
  if (typeof localStorage === 'undefined') return { displayName: '' };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { displayName: '' };
    const parsed = JSON.parse(raw) as Partial<UserSettings> | null;
    if (parsed && typeof parsed.displayName === 'string') {
      return { displayName: parsed.displayName };
    }
    return { displayName: '' };
  } catch {
    return { displayName: '' };
  }
}

export const userSettings = writable<UserSettings>(loadInitial());

// Persist on every change. The first call (from initial subscribe) just
// re-writes whatever we already loaded — harmless and keeps the
// implementation symmetric with notesStore.
userSettings.subscribe((value) => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // quota / private mode — ignore
  }
});

/**
 * Update the display name. Trims surrounding whitespace and clamps to
 * `DISPLAY_NAME_MAX` characters so a paste from the clipboard can't
 * overflow the input.
 */
export function setDisplayName(name: string): void {
  const trimmed = (name ?? '').trim().slice(0, DISPLAY_NAME_MAX);
  userSettings.update((s) => ({ ...s, displayName: trimmed }));
}
