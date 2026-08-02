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
