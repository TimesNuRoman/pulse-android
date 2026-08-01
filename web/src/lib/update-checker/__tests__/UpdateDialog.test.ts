/**
 * UpdateDialog render tests.
 *
 * Covers:
 *   - Renders installed + latest version, size, and release notes link
 *   - "Update now" fires onUpdate with the manifest
 *   - "Later" fires onLater (default flow)
 *   - "Later" is hidden when the dialog is in force-update mode
 *   - Force mode changes the title and hides the Later button
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import UpdateDialog from '../UpdateDialog.svelte';
import type { Manifest } from '../update-checker';

const baseManifest: Manifest = {
  latest_version: '0.6.3',
  latest_version_code: 13,
  latest_apk_url: 'https://example.com/pulse-notes-0.6.3.apk',
  latest_apk_size_bytes: 4_500_000,
  latest_apk_sha256: '2F8BB21841763705C34FDA9DE1281A75029D524AB212F55E48C6BD7A9A288F60',
  release_notes_url: 'https://example.com/changelog#v0.6.3',
  min_supported_version: '0.3.0',
  force_update_below: '0.3.0',
};

describe('UpdateDialog', () => {
  afterEach(cleanup);

  it('renders title, installed version, latest version, and size', () => {
    render(UpdateDialog, {
      props: {
        manifest: baseManifest,
        installedVersion: '0.6.2',
        installedVersionCode: 12,
        onUpdate: vi.fn(),
        onLater: vi.fn(),
      },
    });
    expect(screen.getByTestId('ud-title').textContent).toBe('Update available');
    expect(screen.getByTestId('ud-installed').textContent).toMatch(/v0\.6\.2/);
    expect(screen.getByTestId('ud-latest').textContent).toMatch(/v0\.6\.3/);
    // 4_500_000 bytes / (1024*1024) = 4.29 MB
    expect(screen.getByTestId('ud-size').textContent).toMatch(/4\.29 MB/);
  });

  it('exposes the release notes link with the manifest URL', () => {
    render(UpdateDialog, {
      props: {
        manifest: baseManifest,
        installedVersion: '0.6.2',
        installedVersionCode: 12,
        onUpdate: vi.fn(),
        onLater: vi.fn(),
      },
    });
    const link = screen.getByTestId('ud-release-notes-link');
    expect(link.getAttribute('href')).toBe(baseManifest.release_notes_url);
  });

  it('shows the SHA-256 short fingerprint', () => {
    render(UpdateDialog, {
      props: {
        manifest: baseManifest,
        installedVersion: '0.6.2',
        installedVersionCode: 12,
        onUpdate: vi.fn(),
        onLater: vi.fn(),
      },
    });
    const sha = screen.getByTestId('ud-sha-code').textContent ?? '';
    expect(sha).toMatch(/2F8BB21841763705/);
    expect(sha).toMatch(/9A288F60/);
  });

  it('"Update now" fires onUpdate with the manifest', async () => {
    const onUpdate = vi.fn();
    render(UpdateDialog, {
      props: {
        manifest: baseManifest,
        installedVersion: '0.6.2',
        installedVersionCode: 12,
        onUpdate,
        onLater: vi.fn(),
      },
    });
    await fireEvent.click(screen.getByTestId('ud-cta-update'));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    const arg = onUpdate.mock.calls[0]?.[0] as Manifest;
    expect(arg.latest_version).toBe('0.6.3');
  });

  it('"Later" fires onLater in the soft (non-force) flow', async () => {
    const onLater = vi.fn();
    render(UpdateDialog, {
      props: {
        manifest: baseManifest,
        installedVersion: '0.6.2',
        installedVersionCode: 12,
        onUpdate: vi.fn(),
        onLater,
      },
    });
    expect(screen.getByTestId('ud-cta-later')).toBeInTheDocument();
    await fireEvent.click(screen.getByTestId('ud-cta-later'));
    expect(onLater).toHaveBeenCalledTimes(1);
  });

  it('hides the "Later" button in force-update mode', () => {
    render(UpdateDialog, {
      props: {
        manifest: baseManifest,
        installedVersion: '0.2.9', // below force_update_below = 0.3.0
        installedVersionCode: 9,
        onUpdate: vi.fn(),
        onLater: vi.fn(),
      },
    });
    expect(screen.getByTestId('ud-title').textContent).toBe('Update required');
    expect(screen.getByTestId('update-dialog').getAttribute('data-force')).toBe('true');
    expect(screen.queryByTestId('ud-cta-later')).toBeNull();
  });

  it('does not throw if onLater is omitted', () => {
    render(UpdateDialog, {
      props: {
        manifest: baseManifest,
        installedVersion: '0.6.2',
        installedVersionCode: 12,
        onUpdate: vi.fn(),
        // onLater intentionally omitted — equivalent to force mode
      },
    });
    expect(screen.queryByTestId('ud-cta-later')).toBeNull();
  });
});
