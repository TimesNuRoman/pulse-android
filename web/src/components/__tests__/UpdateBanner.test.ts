/**
 * UpdateBanner render tests.
 *
 * Covers:
 *   - Does not render when isUpdateAvailable=false
 *   - Renders normal (non-force) banner with version, Get it, and ×
 *   - Renders force-update banner without × (dismiss is hidden)
 *   - × click persists the dismiss flag and hides the banner
 *   - Force banner shows "Required update" copy
 *   - aria-live + role=region attributes are set
 *   - Get it click triggers the onGetIt override when provided
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import UpdateBanner from '../UpdateBanner.svelte';
import { clearDismissed, isDismissedFor } from '../../lib/updateChecker';

const baseInfo = {
  isUpdateAvailable: true,
  isForceUpdate: false,
  latestVersion: '0.6.7',
  latestCode: 17,
  downloadUrl: 'https://ownlocalml.com/downloads/pulse-notes-0.6.7.apk',
  releaseNotes: 'New release notes here',
};

const forceInfo = {
  isUpdateAvailable: true,
  isForceUpdate: true,
  latestVersion: '0.6.7',
  latestCode: 17,
  downloadUrl: 'https://ownlocalml.com/downloads/pulse-notes-0.6.7.apk',
  releaseNotes: 'Required release notes',
};

describe('UpdateBanner', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    clearDismissed();
  });

  it('does not render when isUpdateAvailable=false', () => {
    render(UpdateBanner, {
      props: {
        info: { ...baseInfo, isUpdateAvailable: false },
        currentVersion: '0.6.7',
      },
    });
    expect(screen.queryByTestId('update-banner')).toBeNull();
  });

  it('renders normal banner with version and Get it button', () => {
    render(UpdateBanner, {
      props: { info: baseInfo, currentVersion: '0.6.6' },
    });
    const banner = screen.getByTestId('update-banner');
    expect(banner).toBeTruthy();
    expect(banner.getAttribute('data-force')).toBe('false');
    expect(screen.getByTestId('update-banner-title').textContent).toMatch(/Update available/);
    expect(screen.getByTestId('update-banner-version').textContent).toMatch(/0\.6\.6/);
    expect(screen.getByTestId('update-banner-version').textContent).toMatch(/0\.6\.7/);
    expect(screen.getByTestId('update-banner-get-it')).toBeTruthy();
    expect(screen.getByTestId('update-banner-dismiss')).toBeTruthy();
  });

  it('renders force-update banner without dismiss button', () => {
    render(UpdateBanner, {
      props: { info: forceInfo, currentVersion: '0.4.0' },
    });
    const banner = screen.getByTestId('update-banner');
    expect(banner.getAttribute('data-force')).toBe('true');
    expect(screen.getByTestId('update-banner-title').textContent).toMatch(/Required update/);
    expect(screen.getByTestId('update-banner-get-it')).toBeTruthy();
    // Force mode hides the dismiss button entirely.
    expect(screen.queryByTestId('update-banner-dismiss')).toBeNull();
  });

  it('clicking × hides the banner and persists the dismiss flag', async () => {
    render(UpdateBanner, {
      props: { info: baseInfo, currentVersion: '0.6.6' },
    });
    expect(screen.getByTestId('update-banner')).toBeTruthy();
    await fireEvent.click(screen.getByTestId('update-banner-dismiss'));
    // The dismiss flag is per-version.
    expect(isDismissedFor('0.6.7')).toBe(true);
    // The banner is now gone from the DOM (dismiss state hidden).
    expect(screen.queryByTestId('update-banner')).toBeNull();
  });

  it('does not render when the version is already dismissed', () => {
    // Pre-dismiss v0.6.7.
    localStorage.setItem('pulse.updateCheck.dismissed.v1', '0.6.7');
    render(UpdateBanner, {
      props: { info: baseInfo, currentVersion: '0.6.6' },
    });
    expect(screen.queryByTestId('update-banner')).toBeNull();
  });

  it('re-appears when the latest version bumps past the dismissed one', () => {
    // Pre-dismiss 0.6.7; banner reports 0.6.8.
    localStorage.setItem('pulse.updateCheck.dismissed.v1', '0.6.7');
    render(UpdateBanner, {
      props: {
        info: { ...baseInfo, latestVersion: '0.6.8', latestCode: 18 },
        currentVersion: '0.6.6',
      },
    });
    expect(screen.getByTestId('update-banner')).toBeTruthy();
  });

  it('sets aria-live="polite" and role="region"', () => {
    render(UpdateBanner, {
      props: { info: baseInfo, currentVersion: '0.6.6' },
    });
    const banner = screen.getByTestId('update-banner');
    expect(banner.getAttribute('aria-live')).toBe('polite');
    expect(banner.getAttribute('role')).toBe('region');
  });

  it('Get it click calls the onGetIt override when provided', async () => {
    const onGetIt = vi.fn();
    render(UpdateBanner, {
      props: { info: baseInfo, currentVersion: '0.6.6', onGetIt },
    });
    await fireEvent.click(screen.getByTestId('update-banner-get-it'));
    expect(onGetIt).toHaveBeenCalledTimes(1);
    const arg = onGetIt.mock.calls[0]?.[0] as typeof baseInfo;
    expect(arg.latestVersion).toBe('0.6.7');
    expect(arg.downloadUrl).toBe(baseInfo.downloadUrl);
  });
});
