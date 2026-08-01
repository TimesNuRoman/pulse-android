/**
 * Onboarding state — Svelte 5 runes-based reactive store.
 *
 * Tracks the current screen index, whether the user has skipped, and whether
 * the onboarding has been completed. Persists completion to localStorage so
 * the flow only shows on first launch.
 *
 * The "user data" in this store is intentionally tiny (one number, two
 * booleans) — we don't store any preferences from the screens themselves
 * because all four screens are informational, not configurable.
 */
import { writable, type Writable } from 'svelte/store';

const STORAGE_KEY = 'pulse.notes.onboarded';

export const SCREEN_COUNT = 4;
export type ScreenIndex = 0 | 1 | 2 | 3;

export interface OnboardingState {
  /** Current screen index, 0-based (0 = Welcome, 3 = LocalFirst). */
  currentScreen: ScreenIndex;
  /** True if the user hit a "Skip" button. Persisted separately. */
  skipped: boolean;
  /** True once the flow has been completed (reached the last screen's CTA). */
  completed: boolean;
}

const initial: OnboardingState = {
  currentScreen: 0,
  skipped: false,
  completed: false,
};

/**
 * Read the persisted completion flag from localStorage. Safe to call on
 * SSR / non-browser environments — returns false.
 */
export function readPersistedCompleted(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Persist the completion flag. Returns true on success.
 */
export function writePersistedCompleted(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear the persisted completion flag. Used by the "Replay onboarding"
 * affordance (R85+ follow-up) and by tests.
 */
export function clearPersistedCompleted(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function createOnboardingStore(): Writable<OnboardingState> & {
  next: () => void;
  prev: () => void;
  goTo: (idx: ScreenIndex) => void;
  skip: () => void;
  complete: () => void;
  reset: () => void;
} {
  const store = writable<OnboardingState>({
    ...initial,
    completed: readPersistedCompleted(),
  });

  function clamp(idx: number): ScreenIndex {
    if (idx < 0) return 0;
    if (idx >= SCREEN_COUNT) return (SCREEN_COUNT - 1) as ScreenIndex;
    return Math.floor(idx) as ScreenIndex;
  }

  return {
    ...store,
    next(): void {
      store.update((s) => {
        const nextIdx = clamp(s.currentScreen + 1);
        return { ...s, currentScreen: nextIdx };
      });
    },
    prev(): void {
      store.update((s) => {
        const nextIdx = clamp(s.currentScreen - 1);
        return { ...s, currentScreen: nextIdx };
      });
    },
    goTo(idx: ScreenIndex): void {
      store.update((s) => ({ ...s, currentScreen: clamp(idx) }));
    },
    skip(): void {
      // Skip goes to the last screen and marks the run as skipped so
      // analytics (R85+) can show the diff vs completed runs.
      store.update((s) => ({ ...s, skipped: true, currentScreen: (SCREEN_COUNT - 1) as ScreenIndex }));
    },
    complete(): void {
      writePersistedCompleted();
      store.update((s) => ({ ...s, completed: true }));
    },
    reset(): void {
      clearPersistedCompleted();
      store.set({ ...initial });
    },
  };
}

export const onboardingStore = createOnboardingStore();
