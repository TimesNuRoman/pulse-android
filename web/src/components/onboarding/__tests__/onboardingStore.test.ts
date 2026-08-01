import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  onboardingStore,
  SCREEN_COUNT,
  readPersistedCompleted,
  clearPersistedCompleted,
  writePersistedCompleted,
  type ScreenIndex,
} from '../onboardingStore';

describe('onboardingStore', () => {
  beforeEach(() => {
    localStorage.clear();
    onboardingStore.reset();
  });

  it('exports SCREEN_COUNT = 4', () => {
    expect(SCREEN_COUNT).toBe(4);
  });

  it('initializes with currentScreen 0 and not completed', () => {
    const s = get(onboardingStore);
    expect(s.currentScreen).toBe(0);
    expect(s.completed).toBe(false);
    expect(s.skipped).toBe(false);
  });

  it('next() advances currentScreen by 1', () => {
    onboardingStore.next();
    expect(get(onboardingStore).currentScreen).toBe(1);
    onboardingStore.next();
    expect(get(onboardingStore).currentScreen).toBe(2);
  });

  it('next() clamps at the last screen', () => {
    for (let i = 0; i < 10; i++) onboardingStore.next();
    expect(get(onboardingStore).currentScreen).toBe(SCREEN_COUNT - 1);
  });

  it('prev() decrements currentScreen', () => {
    onboardingStore.goTo(2 as ScreenIndex);
    onboardingStore.prev();
    expect(get(onboardingStore).currentScreen).toBe(1);
  });

  it('prev() clamps at 0 (no negative index)', () => {
    onboardingStore.prev();
    onboardingStore.prev();
    expect(get(onboardingStore).currentScreen).toBe(0);
  });

  it('goTo() sets currentScreen directly within bounds', () => {
    onboardingStore.goTo(3 as ScreenIndex);
    expect(get(onboardingStore).currentScreen).toBe(3);
  });

  it('skip() jumps to last screen and sets skipped=true', () => {
    onboardingStore.goTo(0 as ScreenIndex);
    onboardingStore.skip();
    const s = get(onboardingStore);
    expect(s.currentScreen).toBe(SCREEN_COUNT - 1);
    expect(s.skipped).toBe(true);
  });

  it('complete() sets completed=true and persists to localStorage', () => {
    expect(readPersistedCompleted()).toBe(false);
    onboardingStore.complete();
    expect(get(onboardingStore).completed).toBe(true);
    expect(readPersistedCompleted()).toBe(true);
  });

  it('writePersistedCompleted / clearPersistedCompleted round-trip', () => {
    expect(writePersistedCompleted()).toBe(true);
    expect(readPersistedCompleted()).toBe(true);
    clearPersistedCompleted();
    expect(readPersistedCompleted()).toBe(false);
  });

  it('reset() restores initial state and clears persistence', () => {
    onboardingStore.goTo(3 as ScreenIndex);
    onboardingStore.skip();
    onboardingStore.complete();
    expect(readPersistedCompleted()).toBe(true);
    onboardingStore.reset();
    const s = get(onboardingStore);
    expect(s.currentScreen).toBe(0);
    expect(s.skipped).toBe(false);
    expect(s.completed).toBe(false);
    expect(readPersistedCompleted()).toBe(false);
  });

  it('initial state honors previously persisted completion', async () => {
    writePersistedCompleted();
    // Dynamic import gives a fresh module evaluation; mirrors a page reload.
    const mod = await import('../onboardingStore?reload=' + Date.now());
    expect(get(mod.onboardingStore).completed).toBe(true);
  });
});
