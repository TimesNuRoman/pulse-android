/**
 * update-checker tests.
 *
 * Covers:
 *   - compareVersions edge cases (semver-ish, leading 'v', pre-release)
 *   - shouldForceUpdate / shouldPromptUpdate decision matrix
 *   - parseManifest R87 schema + brief's flat aliases + invalid input
 *   - fetchManifest mocked HTTP path
 *   - UpdateChecker.check: cache hit, cache miss, force, error fallback
 *   - getManifestUrl / getInstalledVersion env overrides
 *   - markSeen / clearCache
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  compareVersions,
  shouldForceUpdate,
  shouldPromptUpdate,
  parseManifest,
  fetchManifest,
  UpdateChecker,
  resolveManifestUrl,
  resolveInstalledVersion,
  APP_VERSION,
  APP_VERSION_CODE,
  DEFAULT_MANIFEST_URL,
  CACHE_TTL_MS,
} from '../update-checker';

const validR87 = {
  latest_version: '0.6.2',
  latest_version_code: 12,
  latest_apk_url: 'https://wztgxiy1eu29i.space.minimax.io/pulse-notes-0.6.2-debug.apk',
  latest_apk_size_bytes: 4551289,
  latest_apk_sha256: '2F8BB21841763705C34FDA9DE1281A75029D524AB212F55E48C6BD7A9A288F60',
  release_notes_url: 'https://wztgxiy1eu29i.space.minimax.io/changelog/#v0.6.2',
  min_supported_version: '0.3.0',
  force_update_below: '0.3.0',
  versions: [
    { version: '0.6.2', version_code: 12, date: '2026-08-01', type: 'minor', summary: 'Onboarding v2' },
  ],
};

const validFlat = {
  latest_version: '0.6.2',
  version_code: 12,
  apk_url: 'https://example.com/app.apk',
  size: 1234567,
  sha256: 'ABC',
  release_notes_url: 'https://example.com/changelog',
  min_supported: '0.3.0',
  force_update_below: '0.3.0',
};

describe('compareVersions', () => {
  it('returns positive when a > b', () => {
    expect(compareVersions('0.6.2', '0.6.1')).toBeGreaterThan(0);
  });
  it('returns 0 when a == b', () => {
    expect(compareVersions('0.6.2', '0.6.2')).toBe(0);
  });
  it('returns negative when a < b', () => {
    expect(compareVersions('0.6.2', '0.6.3')).toBeLessThan(0);
  });
  it('treats 0.6.10 as greater than 0.6.2 (numeric, not lexicographic)', () => {
    expect(compareVersions('0.6.10', '0.6.2')).toBeGreaterThan(0);
    expect(compareVersions('0.6.2', '0.6.10')).toBeLessThan(0);
  });
  it('pads missing segments with zero: "0.6" == "0.6.0"', () => {
    expect(compareVersions('0.6', '0.6.0')).toBe(0);
    expect(compareVersions('0.6.0', '0.6')).toBe(0);
  });
  it('strips a leading "v" for compare', () => {
    expect(compareVersions('v0.6.2', '0.6.2')).toBe(0);
    expect(compareVersions('v0.7.0', 'v0.6.99')).toBeGreaterThan(0);
  });
  it('strips a pre-release suffix for compare: "0.6.2-beta" == "0.6.2"', () => {
    expect(compareVersions('0.6.2-beta', '0.6.2')).toBe(0);
    expect(compareVersions('0.6.2-beta.1', '0.6.2')).toBe(0);
  });
  it('coerces non-numeric segments to 0', () => {
    // "0.6.x" parses as 0.6.0 — so equal to 0.6.0
    expect(compareVersions('0.6.x', '0.6.0')).toBe(0);
  });
});

describe('shouldForceUpdate', () => {
  it('returns false when installed == min (equal is OK)', () => {
    expect(shouldForceUpdate('0.3.0', '0.3.0')).toBe(false);
  });
  it('returns true when installed is strictly below min', () => {
    expect(shouldForceUpdate('0.2.9', '0.3.0')).toBe(true);
  });
  it('returns false when installed is above min', () => {
    expect(shouldForceUpdate('0.4.0', '0.3.0')).toBe(false);
  });
});

describe('shouldPromptUpdate', () => {
  it('returns needsUpdate when manifest is strictly newer', () => {
    const m = parseManifest(validR87);
    const r = shouldPromptUpdate('0.6.1', m);
    expect(r.needsUpdate).toBe(true);
    expect(r.forceUpdate).toBe(false);
  });
  it('returns forceUpdate when installed is below force_update_below', () => {
    const m = parseManifest(validR87);
    const r = shouldPromptUpdate('0.2.9', m);
    expect(r.forceUpdate).toBe(true);
    expect(r.needsUpdate).toBe(true);
  });
  it('returns needsUpdate=false when installed is the same as latest', () => {
    const m = parseManifest(validR87);
    const r = shouldPromptUpdate('0.6.2', m);
    expect(r.needsUpdate).toBe(false);
    expect(r.forceUpdate).toBe(false);
  });
  it('returns needsUpdate=false when installed is newer than manifest (downgrade case)', () => {
    const m = parseManifest(validR87);
    const r = shouldPromptUpdate('0.7.0', m);
    expect(r.needsUpdate).toBe(false);
    expect(r.forceUpdate).toBe(false);
  });
});

describe('parseManifest', () => {
  it('accepts the deployed R87 schema (latest_*)', () => {
    const m = parseManifest(validR87);
    expect(m.latest_version).toBe('0.6.2');
    expect(m.latest_version_code).toBe(12);
    expect(m.latest_apk_url).toBe(validR87.latest_apk_url);
    expect(m.latest_apk_sha256).toBe(validR87.latest_apk_sha256);
    expect(m.min_supported_version).toBe('0.3.0');
    expect(m.force_update_below).toBe('0.3.0');
    expect(m.versions?.length).toBe(1);
  });
  it('accepts the brief flat aliases (apk_url, sha256, size, version_code, min_supported)', () => {
    const m = parseManifest(validFlat);
    expect(m.latest_version).toBe('0.6.2');
    expect(m.latest_version_code).toBe(12);
    expect(m.latest_apk_url).toBe('https://example.com/app.apk');
    expect(m.latest_apk_size_bytes).toBe(1234567);
    expect(m.latest_apk_sha256).toBe('ABC');
    expect(m.min_supported_version).toBe('0.3.0');
  });
  it('rejects a non-object input', () => {
    expect(() => parseManifest(null)).toThrow();
    expect(() => parseManifest('string')).toThrow();
    expect(() => parseManifest(42)).toThrow();
  });
  it('rejects a manifest missing a required string field', () => {
    const bad = { ...validR87 };
    delete (bad as Record<string, unknown>)['release_notes_url'];
    expect(() => parseManifest(bad)).toThrow(/release_notes_url/);
  });
  it('rejects a manifest missing a required number field', () => {
    const bad = { ...validR87 };
    delete (bad as Record<string, unknown>)['latest_version_code'];
    expect(() => parseManifest(bad)).toThrow(/latest_version_code/);
  });
  it('tolerates a missing `versions` array', () => {
    const bad = { ...validR87 };
    delete (bad as Record<string, unknown>)['versions'];
    const m = parseManifest(bad);
    expect(m.versions).toBeUndefined();
  });
});

describe('fetchManifest', () => {
  it('parses a successful HTTP response', async () => {
    const fetcher = vi.fn(async (_url: string) =>
      new Response(JSON.stringify(validR87), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const m = await fetchManifest('https://example.com/m.json', { fetcher: fetcher as unknown as typeof fetch });
    expect(m.latest_version).toBe('0.6.2');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('throws on non-2xx HTTP', async () => {
    const fetcher = vi.fn(async () => new Response('not found', { status: 404 }));
    await expect(
      fetchManifest('https://example.com/m.json', { fetcher: fetcher as unknown as typeof fetch }),
    ).rejects.toThrow(/HTTP 404/);
  });
  it('throws on invalid JSON', async () => {
    const fetcher = vi.fn(async () => new Response('not json', { status: 200 }));
    await expect(
      fetchManifest('https://example.com/m.json', { fetcher: fetcher as unknown as typeof fetch }),
    ).rejects.toThrow();
  });
});

describe('resolveManifestUrl / resolveInstalledVersion (pure env helpers)', () => {
  it('resolveManifestUrl returns the default when env is null', () => {
    expect(resolveManifestUrl(null)).toBe(DEFAULT_MANIFEST_URL);
  });
  it('resolveManifestUrl returns the default when env is empty', () => {
    expect(resolveManifestUrl({})).toBe(DEFAULT_MANIFEST_URL);
  });
  it('resolveManifestUrl reads VITE_UPDATE_MANIFEST_URL when set', () => {
    expect(resolveManifestUrl({ VITE_UPDATE_MANIFEST_URL: 'https://custom.example.com/m.json' })).toBe(
      'https://custom.example.com/m.json',
    );
  });
  it('resolveManifestUrl trims whitespace', () => {
    expect(resolveManifestUrl({ VITE_UPDATE_MANIFEST_URL: '  https://x.com/m.json  ' })).toBe(
      'https://x.com/m.json',
    );
  });
  it('resolveInstalledVersion returns the hard-coded constants by default', () => {
    const v = resolveInstalledVersion(null);
    expect(v.version).toBe(APP_VERSION);
    expect(v.versionCode).toBe(APP_VERSION_CODE);
  });
  it('resolveInstalledVersion honors VITE_APP_VERSION / VITE_APP_VERSION_CODE', () => {
    const v = resolveInstalledVersion({
      VITE_APP_VERSION: '0.7.0',
      VITE_APP_VERSION_CODE: '14',
    });
    expect(v.version).toBe('0.7.0');
    expect(v.versionCode).toBe(14);
  });
  it('resolveInstalledVersion accepts a numeric version code without parsing', () => {
    const v = resolveInstalledVersion({
      VITE_APP_VERSION: '0.7.0',
      VITE_APP_VERSION_CODE: 14,
    });
    expect(v.versionCode).toBe(14);
  });
  it('resolveInstalledVersion falls back to the build constants when the env value is invalid', () => {
    const v = resolveInstalledVersion({ VITE_APP_VERSION_CODE: 'not-a-number' });
    expect(v.versionCode).toBe(APP_VERSION_CODE);
  });
});

describe('UpdateChecker.check', () => {
  let checker: UpdateChecker;

  beforeEach(() => {
    localStorage.clear();
    checker = new UpdateChecker();
  });

  it('fetches and reports needsUpdate when manifest is newer than installed', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(validR87), { status: 200 }));
    const r = await checker.check({
      fetcher: fetcher as unknown as typeof fetch,
      force: true,
      installedVersion: { version: '0.6.1', versionCode: 11 },
    });
    expect(r.needsUpdate).toBe(true);
    expect(r.forceUpdate).toBe(false);
    expect(r.fromCache).toBe(false);
    expect(r.manifest?.latest_version).toBe('0.6.2');
    expect(r.error).toBeNull();
  });

  it('reports forceUpdate when installed is below force_update_below', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(validR87), { status: 200 }));
    const r = await checker.check({
      fetcher: fetcher as unknown as typeof fetch,
      force: true,
      installedVersion: { version: '0.2.9', versionCode: 9 },
    });
    expect(r.forceUpdate).toBe(true);
    expect(r.needsUpdate).toBe(true);
  });

  it('returns fromCache when the cache is fresh', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(validR87), { status: 200 }));
    // First call writes the cache.
    await checker.check({ fetcher: fetcher as unknown as typeof fetch, force: true });
    // Second call should hit the cache, not the network.
    const r = await checker.check({ fetcher: fetcher as unknown as typeof fetch });
    expect(r.fromCache).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('force=true bypasses the cache and refetches', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(validR87), { status: 200 }));
    await checker.check({ fetcher: fetcher as unknown as typeof fetch, force: true });
    await checker.check({ fetcher: fetcher as unknown as typeof fetch, force: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('stale cache is refreshed when the TTL has passed', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(validR87), { status: 200 }));
    // Seed the cache with a checkedAt older than the TTL.
    const oldTimestamp = Date.now() - (CACHE_TTL_MS + 60_000);
    localStorage.setItem(
      'pulse.update_checker.v1',
      JSON.stringify({ manifest: validR87, checkedAt: oldTimestamp, lastSeenVersion: '0.6.2' }),
    );
    const r = await checker.check({ fetcher: fetcher as unknown as typeof fetch });
    expect(r.fromCache).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('falls back to a stale cache when the network fetch fails', async () => {
    const fetcher = vi.fn(async () => new Response('boom', { status: 503 }));
    // Seed a recent cache so the test "would have used cache" without force.
    localStorage.setItem(
      'pulse.update_checker.v1',
      JSON.stringify({ manifest: validR87, checkedAt: Date.now(), lastSeenVersion: '0.6.2' }),
    );
    // Force the network call to surface the fallback.
    const r = await checker.check({ fetcher: fetcher as unknown as typeof fetch, force: true });
    expect(r.fromCache).toBe(true);
    expect(r.manifest?.latest_version).toBe('0.6.2');
    expect(r.error).toMatch(/503/);
  });

  it('returns needsUpdate=false and no manifest when fetch fails with no cache', async () => {
    const fetcher = vi.fn(async () => new Response('boom', { status: 500 }));
    const r = await checker.check({ fetcher: fetcher as unknown as typeof fetch, force: true });
    expect(r.needsUpdate).toBe(false);
    expect(r.manifest).toBeNull();
    expect(r.error).toMatch(/500/);
  });

  it('markSeen rewrites the cache timestamp', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(validR87), { status: 200 }));
    await checker.check({ fetcher: fetcher as unknown as typeof fetch, force: true });
    const before = checker.readCache();
    expect(before).not.toBeNull();
    // Rewind checkedAt to make the change visible.
    if (before) {
      localStorage.setItem(
        'pulse.update_checker.v1',
        JSON.stringify({ ...before, checkedAt: before.checkedAt - 5000 }),
      );
    }
    await checker.markSeen();
    const after = checker.readCache();
    expect(after).not.toBeNull();
    if (after && before) {
      // markSeen should have moved checkedAt forward by at least 4000ms
      // (we rewound 5000ms).
      expect(after.checkedAt).toBeGreaterThan(before.checkedAt);
    }
  });

  it('clearCache removes the storage entry and the in-flight pointer', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(validR87), { status: 200 }));
    await checker.check({ fetcher: fetcher as unknown as typeof fetch, force: true });
    expect(checker.readCache()).not.toBeNull();
    checker.clearCache();
    expect(checker.readCache()).toBeNull();
  });

  it('deduplicates in-flight requests within a single launch (mixes force and non-force)', async () => {
    let resolveFetch: ((r: Response) => void) | null = null;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const p1 = checker.check({ fetcher: fetcher as unknown as typeof fetch, force: true });
    // Force a microtask flush so p1's check() body runs to the await.
    await Promise.resolve();
    const p2 = checker.check({ fetcher: fetcher as unknown as typeof fetch });
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolveFetch?.(new Response(JSON.stringify(validR87), { status: 200 }));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(r2);
  });
});
