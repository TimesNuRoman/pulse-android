/**
 * updateChecker tests.
 *
 * Covers:
 *   - compareVersions edge cases
 *   - checkForUpdate: no-update, update-available, force-update
 *   - 5s fetch timeout (uses small timeoutMs option to keep test fast)
 *   - Network error / HTTP error / parse error -> null (no throw)
 *   - localStorage cache hit (no fetch)
 *   - 24h debounce: fresh cache returns cached result
 *   - Stale cache (> 24h) re-fetches
 *   - Dismiss flag is per-version (isDismissedFor / dismissFor)
 *   - clearCache drops both result + timestamp
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkForUpdate,
  compareVersions,
  getCachedUpdate,
  clearCache,
  isDismissedFor,
  dismissFor,
  clearDismissed,
  FETCH_TIMEOUT_MS,
  CACHE_TTL_MS,
  MANIFEST_URL,
} from '../updateChecker';
import { APP_VERSION, APP_VERSION_CODE } from '../version';

const validManifest = {
  platform: 'android',
  latest_version: '0.6.7',
  latest_version_code: 17,
  min_supported_version: '0.5.0',
  force_update_below: '0.5.0',
  download_url: 'https://ownlocalml.com/downloads/pulse-notes-0.6.7.apk',
  signature_sha256: '47f5e91' + 'a'.repeat(56) + '6a6730',
  release_notes: 'v0.6.7 release notes',
  versions: [],
};

function mockOkFetch(body: unknown): typeof fetch {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
  })) as unknown as typeof fetch;
}

function mockErrorFetch(status = 500): typeof fetch {
  return vi.fn(async () => ({
    ok: false,
    status,
    statusText: 'Server Error',
  })) as unknown as typeof fetch;
}

function mockHangingFetch(): typeof fetch {
  return vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          if (signal.aborted) reject(new DOMException('Aborted', 'AbortError'));
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }
        // never resolves
      }),
  ) as unknown as typeof fetch;
}

describe('compareVersions', () => {
  it('returns 0 when equal', () => {
    expect(compareVersions('0.6.7', '0.6.7')).toBe(0);
  });
  it('returns positive when a > b', () => {
    expect(compareVersions('0.6.7', '0.6.6')).toBeGreaterThan(0);
  });
  it('returns negative when a < b', () => {
    expect(compareVersions('0.6.6', '0.6.7')).toBeLessThan(0);
  });
  it('treats 0.6.10 > 0.6.9 (numeric, not lexicographic)', () => {
    expect(compareVersions('0.6.10', '0.6.9')).toBeGreaterThan(0);
  });
  it('pads missing segments with zero', () => {
    expect(compareVersions('0.6', '0.6.0')).toBe(0);
  });
});

describe('constants', () => {
  it('FETCH_TIMEOUT_MS is 5000', () => {
    expect(FETCH_TIMEOUT_MS).toBe(5000);
  });
  it('CACHE_TTL_MS is 24h', () => {
    expect(CACHE_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
  it('MANIFEST_URL is the relative path', () => {
    expect(MANIFEST_URL).toBe('/updates/android.json');
  });
  it('APP_VERSION / APP_VERSION_CODE match package.json', () => {
    expect(APP_VERSION).toBe('0.6.7');
    expect(APP_VERSION_CODE).toBe(17);
  });
});

describe('checkForUpdate — update detection', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns isUpdateAvailable=false when manifest version == current', async () => {
    const fetch = mockOkFetch(validManifest);
    const info = await checkForUpdate('0.6.7', 17, { fetcher: fetch });
    expect(info).not.toBeNull();
    expect(info?.isUpdateAvailable).toBe(false);
    expect(info?.isForceUpdate).toBe(false);
    expect(info?.latestVersion).toBe('0.6.7');
  });

  it('returns isUpdateAvailable=true when manifest version > current', async () => {
    const fetch = mockOkFetch(validManifest);
    const info = await checkForUpdate('0.6.6', 16, { fetcher: fetch });
    expect(info).not.toBeNull();
    expect(info?.isUpdateAvailable).toBe(true);
    expect(info?.isForceUpdate).toBe(false);
    expect(info?.latestVersion).toBe('0.6.7');
    expect(info?.latestCode).toBe(17);
    expect(info?.downloadUrl).toBe(validManifest.download_url);
  });

  it('returns isUpdateAvailable=true when only code is newer (same version string)', async () => {
    const fetch = mockOkFetch(validManifest);
    // Same version string but manifest code (17) > current code (16)
    const info = await checkForUpdate('0.6.7', 16, { fetcher: fetch });
    expect(info?.isUpdateAvailable).toBe(true);
  });

  it('returns isForceUpdate=true when current < force_update_below', async () => {
    const fetch = mockOkFetch(validManifest);
    // force_update_below is 0.5.0; current 0.4.0 is below
    const info = await checkForUpdate('0.4.0', 10, { fetcher: fetch });
    expect(info?.isUpdateAvailable).toBe(true);
    expect(info?.isForceUpdate).toBe(true);
  });

  it('does not force when current >= force_update_below (equal is fine)', async () => {
    const fetch = mockOkFetch(validManifest);
    const info = await checkForUpdate('0.5.0', 5, { fetcher: fetch });
    expect(info?.isForceUpdate).toBe(false);
  });
});

describe('checkForUpdate — error handling', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null (no throw) on network error', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const info = await checkForUpdate('0.6.7', 17, { fetcher: fetch });
    expect(info).toBeNull();
  });

  it('returns null on HTTP error (500)', async () => {
    const fetch = mockErrorFetch(500);
    const info = await checkForUpdate('0.6.7', 17, { fetcher: fetch });
    expect(info).toBeNull();
  });

  it('returns null on HTTP error (404)', async () => {
    const fetch = mockErrorFetch(404);
    const info = await checkForUpdate('0.6.7', 17, { fetcher: fetch });
    expect(info).toBeNull();
  });

  it('returns null on parse error (non-JSON body)', async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    })) as unknown as typeof fetch;
    const info = await checkForUpdate('0.6.7', 17, { fetcher: fetch });
    expect(info).toBeNull();
  });

  it('returns null on manifest missing required field', async () => {
    const fetch = mockOkFetch({ platform: 'android' }); // no latest_version
    const info = await checkForUpdate('0.6.7', 17, { fetcher: fetch });
    expect(info).toBeNull();
  });

  it('aborts and returns null when fetch hangs past timeoutMs', async () => {
    const fetch = mockHangingFetch();
    // Use a small timeout to keep the test fast.
    const info = await checkForUpdate('0.6.7', 17, { fetcher: fetch, timeoutMs: 50 });
    expect(info).toBeNull();
  });
});

describe('checkForUpdate — caching and debounce', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('writes the result to localStorage on success', async () => {
    const fetch = mockOkFetch(validManifest);
    await checkForUpdate('0.6.6', 16, { fetcher: fetch });
    const cached = localStorage.getItem('pulse.updateCheck.lastResult.v1');
    const ts = localStorage.getItem('pulse.updateCheck.lastCheck.v1');
    expect(cached).not.toBeNull();
    expect(ts).not.toBeNull();
    const parsed = JSON.parse(cached as string);
    expect(parsed.isUpdateAvailable).toBe(true);
    expect(parsed.latestVersion).toBe('0.6.7');
  });

  it('returns cached result without fetching when cache is fresh', async () => {
    // Pre-populate the cache with a fresh result.
    const cachedInfo = {
      isUpdateAvailable: true,
      isForceUpdate: false,
      latestVersion: '0.6.7',
      latestCode: 17,
      downloadUrl: 'https://ownlocalml.com/downloads/pulse-notes-0.6.7.apk',
      releaseNotes: 'cached',
    };
    localStorage.setItem('pulse.updateCheck.lastResult.v1', JSON.stringify(cachedInfo));
    localStorage.setItem('pulse.updateCheck.lastCheck.v1', String(Date.now()));

    const fetch = vi.fn() as unknown as typeof fetch;
    const info = await checkForUpdate('0.6.6', 16, { fetcher: fetch });
    expect(info).not.toBeNull();
    expect(info?.latestVersion).toBe('0.6.7');
    expect(info?.releaseNotes).toBe('cached');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('re-fetches when cache is older than 24h', async () => {
    const cachedInfo = {
      isUpdateAvailable: true,
      isForceUpdate: false,
      latestVersion: '0.6.7',
      latestCode: 17,
      downloadUrl: 'https://ownlocalml.com/downloads/pulse-notes-0.6.7.apk',
      releaseNotes: 'stale',
    };
    const stale = Date.now() - (CACHE_TTL_MS + 60_000); // 1 min past TTL
    localStorage.setItem('pulse.updateCheck.lastResult.v1', JSON.stringify(cachedInfo));
    localStorage.setItem('pulse.updateCheck.lastCheck.v1', String(stale));

    const fetch = mockOkFetch(validManifest);
    const info = await checkForUpdate('0.6.6', 16, { fetcher: fetch });
    expect(fetch).toHaveBeenCalledTimes(1);
    // The fresh result wins (release_notes from validManifest, not 'stale').
    expect(info?.releaseNotes).toBe('v0.6.7 release notes');
  });

  it('bypasses cache when bypassCache=true', async () => {
    const cachedInfo = {
      isUpdateAvailable: true,
      isForceUpdate: false,
      latestVersion: '0.6.7',
      latestCode: 17,
      downloadUrl: 'cached',
      releaseNotes: 'cached',
    };
    localStorage.setItem('pulse.updateCheck.lastResult.v1', JSON.stringify(cachedInfo));
    localStorage.setItem('pulse.updateCheck.lastCheck.v1', String(Date.now()));

    const fetch = mockOkFetch(validManifest);
    await checkForUpdate('0.6.6', 16, { fetcher: fetch, bypassCache: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('two calls within 24h only fetch once (debounce)', async () => {
    const fetch = mockOkFetch(validManifest);
    const first = await checkForUpdate('0.6.6', 16, { fetcher: fetch });
    const second = await checkForUpdate('0.6.6', 16, { fetcher: fetch });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(first?.latestVersion).toBe('0.6.7');
    expect(second?.latestVersion).toBe('0.6.7');
  });
});

describe('cache + dismiss helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('getCachedUpdate returns null when no cache', () => {
    expect(getCachedUpdate()).toBeNull();
  });

  it('getCachedUpdate returns cached info when fresh', () => {
    const info = {
      isUpdateAvailable: true,
      isForceUpdate: false,
      latestVersion: '0.6.7',
      latestCode: 17,
      downloadUrl: 'u',
      releaseNotes: '',
    };
    localStorage.setItem('pulse.updateCheck.lastResult.v1', JSON.stringify(info));
    localStorage.setItem('pulse.updateCheck.lastCheck.v1', String(Date.now()));
    expect(getCachedUpdate()?.latestVersion).toBe('0.6.7');
  });

  it('clearCache drops both result and timestamp', () => {
    localStorage.setItem('pulse.updateCheck.lastResult.v1', '{}');
    localStorage.setItem('pulse.updateCheck.lastCheck.v1', '1');
    clearCache();
    expect(localStorage.getItem('pulse.updateCheck.lastResult.v1')).toBeNull();
    expect(localStorage.getItem('pulse.updateCheck.lastCheck.v1')).toBeNull();
  });

  it('isDismissedFor is per-version', () => {
    dismissFor('0.6.7');
    expect(isDismissedFor('0.6.7')).toBe(true);
    expect(isDismissedFor('0.6.8')).toBe(false);
  });

  it('clearDismissed removes the flag', () => {
    dismissFor('0.6.7');
    clearDismissed();
    expect(isDismissedFor('0.6.7')).toBe(false);
  });
});
