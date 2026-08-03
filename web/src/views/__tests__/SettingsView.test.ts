import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import SettingsView from '../SettingsView.svelte';
import { notesStore } from '$lib/notesStore';

describe('SettingsView', () => {
  beforeEach(() => {
    localStorage.clear();
    notesStore.resetToMocks();
  });
  afterEach(cleanup);

  it('renders the four sections (Profile, Theme, About, Actions)', () => {
    render(SettingsView, { props: { onBack: vi.fn(), onReplayOnboarding: vi.fn() } });
    expect(screen.getByTestId('settings-section-profile')).toBeInTheDocument();
    expect(screen.getByTestId('settings-section-theme')).toBeInTheDocument();
    expect(screen.getByTestId('settings-section-about')).toBeInTheDocument();
    expect(screen.getByTestId('settings-section-actions')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.getByText('Theme')).toBeInTheDocument();
    expect(screen.getByText('About')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('tapping "Replay onboarding" fires the onReplayOnboarding callback', async () => {
    const onReplay = vi.fn();
    render(SettingsView, { props: { onBack: vi.fn(), onReplayOnboarding: onReplay } });
    await fireEvent.click(screen.getByTestId('settings-replay-onboarding'));
    expect(onReplay).toHaveBeenCalledTimes(1);
  });

  it('tapping "Reset to mock data" calls notesStore.resetToMocks()', async () => {
    const victim = notesStore.create('# will be reset');
    expect(notesStore.get(victim.id)).toBeDefined();
    render(SettingsView, { props: { onBack: vi.fn(), onReplayOnboarding: vi.fn() } });
    await fireEvent.click(screen.getByTestId('settings-reset-mocks'));
    expect(notesStore.get(victim.id)).toBeUndefined();
    expect(notesStore.list().length).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// R167 — haptics toggle in the Accessibility section
// ---------------------------------------------------------------------------

describe('SettingsView — R167 haptics toggle', () => {
  const HAPTICS_KEY = 'pulse.haptics.enabled';

  beforeEach(() => {
    localStorage.clear();
    notesStore.resetToMocks();
  });
  afterEach(cleanup);

  it('renders the haptic toggle inside the Accessibility section', () => {
    render(SettingsView, { props: { onBack: vi.fn(), onReplayOnboarding: vi.fn() } });
    // The Accessibility section exists and contains the Haptics toggle.
    const accessibility = screen.getByTestId('settings-section-accessibility');
    expect(accessibility).toBeInTheDocument();
    expect(screen.getByTestId('settings-haptics-toggle')).toBeInTheDocument();
    // Brief asks for 3 demo buttons (Light/Medium/Selection). R167 ships 4
    // (adds Success) so the notification codepath is also reachable from
    // the UI without going through the test helpers.
    expect(screen.getByTestId('settings-haptics-demo-light')).toBeInTheDocument();
    expect(screen.getByTestId('settings-haptics-demo-medium')).toBeInTheDocument();
    expect(screen.getByTestId('settings-haptics-demo-selection')).toBeInTheDocument();
  });

  it('clicking the haptic toggle flips localStorage to "false" then back to "true"', async () => {
    // Default: enabled → localStorage is either empty or "true" (the store
    // subscribes and re-writes whatever the initial value was on load).
    render(SettingsView, { props: { onBack: vi.fn(), onReplayOnboarding: vi.fn() } });
    const toggle = screen.getByTestId('settings-haptics-toggle') as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    expect(localStorage.getItem(HAPTICS_KEY)).not.toBe('false');

    // Uncheck → localStorage flips to 'false'.
    await fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);
    expect(localStorage.getItem(HAPTICS_KEY)).toBe('false');

    // Re-check → localStorage flips back to 'true'.
    await fireEvent.click(toggle);
    expect(toggle.checked).toBe(true);
    expect(localStorage.getItem(HAPTICS_KEY)).toBe('true');
  });
});
