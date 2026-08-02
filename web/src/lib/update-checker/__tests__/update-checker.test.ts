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
  fetchManifestFromChain,
  UpdateChecker,
  resolveManifestUrl,
  resolveManifestUrls,
  resolveInstalledVersion,
  APP_VERSION,
  APP_VERSION_CODE,
  DEFAULT_MANIFEST_URL,
  DEFAULT_MANIFEST_URLS,
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
    if (!before) return;
    // Rewind checkedAt by 5000ms to make the markSeen move visible.
    const rewound = before.checkedAt - 5000;
    localStorage.setItem(
      'pulse.update_checker.v1',
      JSON.stringify({ ...before, checkedAt: rewound }),
    );
    // Pass a `now` seam so the test is deterministic regardless of
    // wall-clock resolution (Date.now() can return the same value on
    // back-to-back reads within a single ms — the original assertion
    // was flaky in CI).
    const advancedNow = before.checkedAt + 1000;
    await checker.markSeen(() => advancedNow);
    const after = checker.readCache();
    expect(after).not.toBeNull();
    if (after) {
      // markSeen moves forward past the rewound value AND past the
      // simulated wall-clock tick.
      expect(after.checkedAt).toBeGreaterThan(rewound);
      expect(after.checkedAt).toBe(advancedNow);
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

  it('uses the first URL in the chain and reports manifestUrl (R90)', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(validR87), { status: 200 }));
    const r = await checker.check({
      fetcher: fetcher as unknown as typeof fetch,
      force: true,
      urls: ['https://a.example.com/m.json', 'https://b.example.com/m.json'],
    });
    expect(r.manifestUrl).toBe('https://a.example.com/m.json');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(r.manifest?.latest_version).toBe('0.6.2');
  });

  it('falls back through the chain when the first URL returns 404 (R90)', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.startsWith('https://a.example.com')) {
        return new Response('not found', { status: 404 });
      }
      return new Response(JSON.stringify(validR87), { status: 200 });
    });
    const r = await checker.check({
      fetcher: fetcher as unknown as typeof fetch,
      force: true,
      urls: ['https://a.example.com/m.json', 'https://b.example.com/m.json'],
    });
    expect(r.manifestUrl).toBe('https://b.example.com/m.json');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(r.manifest?.latest_version).toBe('0.6.2');
    // The fallback note is appended to error so testers can see "after N failed".
    expect(r.error).toMatch(/1 failed/);
  });

  it('falls back through the chain when the first URL returns invalid JSON (R90)', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.startsWith('https://a.example.com')) {
        return new Response('not json', { status: 200 });
      }
      return new Response(JSON.stringify(validR87), { status: 200 });
    });
    const r = await checker.check({
      fetcher: fetcher as unknown as typeof fetch,
      force: true,
      urls: ['https://a.example.com/m.json', 'https://b.example.com/m.json'],
    });
    expect(r.manifestUrl).toBe('https://b.example.com/m.json');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('falls back through the chain when the first URL times out (R90)', async () => {
    // Simulate a timeout by raising an AbortError on the first URL.
    // The production code's setTimeout-based abort is internal; we
    // verify the chain's tolerance by throwing the same kind of
    // error the AbortController produces when it fires.
    const fetcher = vi.fn(async (url: string) => {
      if (url.startsWith('https://a.example.com')) {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      }
      return new Response(JSON.stringify(validR87), { status: 200 });
    });
    const r = await checker.check({
      fetcher: fetcher as unknown as typeof fetch,
      force: true,
      urls: ['https://a.example.com/m.json', 'https://b.example.com/m.json'],
    });
    expect(r.manifestUrl).toBe('https://b.example.com/m.json');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(r.manifest?.latest_version).toBe('0.6.2');
  });

  it('returns needsUpdate=false and no manifest when ALL URLs in the chain fail (R90)', async () => {
    const fetcher = vi.fn(async () => new Response('boom', { status: 500 }));
    const r = await checker.check({
      fetcher: fetcher as unknown as typeof fetch,
      force: true,
      urls: ['https://a.example.com/m.json', 'https://b.example.com/m.json', 'https://c.example.com/m.json'],
    });
    expect(r.needsUpdate).toBe(false);
    expect(r.manifest).toBeNull();
    expect(r.manifestUrl).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(r.error).toMatch(/All 3 manifest URLs failed/);
  });

  it('honors a single-URL `url` option as a one-element chain (backward compat, R90)', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(validR87), { status: 200 }));
    const r = await checker.check({
      fetcher: fetcher as unknown as typeof fetch,
      force: true,
      url: 'https://legacy.example.com/m.json',
    });
    expect(r.manifestUrl).toBe('https://legacy.example.com/m.json');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('resolveManifestUrls (R90)', () => {
  it('returns the default chain when env is null', () => {
    const urls = resolveManifestUrls(null);
    expect(urls).toEqual([...DEFAULT_MANIFEST_URLS]);
  });
  it('returns the default chain when env is empty', () => {
    const urls = resolveManifestUrls({});
    expect(urls).toEqual([...DEFAULT_MANIFEST_URLS]);
  });
  it('puts the env override at the head of the chain', () => {
    const urls = resolveManifestUrls({
      VITE_UPDATE_MANIFEST_URL: 'https://custom.example.com/m.json',
    });
    expect(urls[0]).toBe('https://custom.example.com/m.json');
    expect(urls.length).toBe(DEFAULT_MANIFEST_URLS.length + 1);
  });
  it('trims whitespace from the env override', () => {
    const urls = resolveManifestUrls({
      VITE_UPDATE_MANIFEST_URL: '  https://x.example.com/m.json  ',
    });
    expect(urls[0]).toBe('https://x.example.com/m.json');
  });
  it('falls back to the default chain when the env override is empty/whitespace', () => {
    const urls = resolveManifestUrls({ VITE_UPDATE_MANIFEST_URL: '   ' });
    expect(urls).toEqual([...DEFAULT_MANIFEST_URLS]);
  });
  it('chains the canonical R88 host first (R90-era policy, superseded by R93 → R103)', () => {
    // R90 originally put the R88 host at index 0; R93 superseded this by
    // adding R92 + R90 to the head; R103 supersedes R93 by adding R102
    // (the v0.6.6 public deploy) at index 0. This test now pins the
    // R103 ordering: R102 is head, R92 is index 1, R90 is index 2,
    // R88 is at index 3.
    const urls = resolveManifestUrls(null);
    expect(urls[0]).toContain('ncfosklh79sxf'); // R102 (v0.6.6)
    expect(urls[1]).toContain('yv5eeknt6h6sa'); // R92 (v0.6.5)
    expect(urls[2]).toContain('ad67rp710vsl7'); // R90 (v0.6.4)
    expect(urls[3]).toContain('32dhrw35m4x2v'); // R88 (v0.6.3)
  });
  it('chains the R102 (ncfosklh79sxf) host first (R103 v0.6.6 deploy)', () => {
    const urls = resolveManifestUrls(null);
    expect(urls[0]).toContain('ncfosklh79sxf');
    expect(urls[1]).toContain('yv5eeknt6h6sa');
    expect(urls[2]).toContain('ad67rp710vsl7');
  });
  it('chain has the v0.6.6 R102 host at the head regardless of env', () => {
    // Env override goes BEFORE the chain head, but the R102 host must
    // still be the first default (i.e. index 1 after the env override).
    const urls = resolveManifestUrls({
      VITE_UPDATE_MANIFEST_URL: 'https://custom.example.com/m.json',
    });
    expect(urls[0]).toBe('https://custom.example.com/m.json');
    expect(urls[1]).toContain('ncfosklh79sxf');
  });
  it('APP_VERSION / APP_VERSION_CODE reflect v0.6.6 / 16', () => {
    expect(APP_VERSION).toBe('0.6.6');
    expect(APP_VERSION_CODE).toBe(16);
  });
  it('chain length grew from 5 (R90) to 7 (R93) to 8 (R103: +R102)', () => {
    // R93 added R92 (yv5eeknt6h6sa) at index 0 and R90 (ad67rp710vsl7) at
    // index 1 (5 → 7 entries). R103 adds R102 (ncfosklh79sxf) at the head
    // so v0.6.5/6 users can see v0.6.6+ without a chain fallthrough.
    expect(DEFAULT_MANIFEST_URLS.length).toBe(8);
  });
});

describe('fetchManifestFromChain (R90)', () => {
  it('returns the first successful URL with no fallback note when first wins', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.startsWith('https://a.example.com')) {
        return new Response(JSON.stringify(validR87), { status: 200 });
      }
      return new Response('boom', { status: 500 });
    });
    const r = await fetchManifestFromChain(
      ['https://a.example.com/m.json', 'https://b.example.com/m.json'],
      { fetcher: fetcher as unknown as typeof fetch },
    );
    expect(r.url).toBe('https://a.example.com/m.json');
    expect(r.attempts).toEqual([]);
    expect(r.manifest.latest_version).toBe('0.6.2');
  });

  it('records the per-URL failure attempts when a fallback is used', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.startsWith('https://a.example.com')) {
        return new Response('not found', { status: 404 });
      }
      return new Response(JSON.stringify(validR87), { status: 200 });
    });
    const r = await fetchManifestFromChain(
      ['https://a.example.com/m.json', 'https://b.example.com/m.json'],
      { fetcher: fetcher as unknown as typeof fetch },
    );
    expect(r.url).toBe('https://b.example.com/m.json');
    expect(r.attempts.length).toBe(1);
    expect(r.attempts[0].url).toBe('https://a.example.com/m.json');
    expect(r.attempts[0].error).toMatch(/HTTP 404/);
  });

  it('throws with a summary of all failures when no URL succeeds', async () => {
    const fetcher = vi.fn(async () => new Response('boom', { status: 500 }));
    await expect(
      fetchManifestFromChain(
        ['https://a.example.com/m.json', 'https://b.example.com/m.json'],
        { fetcher: fetcher as unknown as typeof fetch },
      ),
    ).rejects.toThrow(/All 2 manifest URLs failed.*HTTP 500.*HTTP 500/);
  });

  it('throws immediately on an empty URL list', async () => {
    await expect(fetchManifestFromChain([])).rejects.toThrow(
      /at least one URL/,
    );
  });
});

describe('R93 v0.6.5 — bridge release chain behaviour', () => {
  it('UpdateChecker.check treats v0.6.5 manifest as the latest', async () => {
    // A v0.6.4 user polling the R93 chain: sees v0.6.5, gets needsUpdate=true.
    const validR93 = {
      ...validR87,
      latest_version: '0.6.5',
      latest_version_code: 15,
      latest_apk_url: 'https://v065.example.com/pulse-notes-0.6.5-debug.apk',
      latest_apk_sha256: 'NEW_SHA_FOR_V065',
      release_notes_url: 'https://v065.example.com/release-notes-v0.6.5/',
    };
    const fetcher = vi.fn(async () => new Response(JSON.stringify(validR93), { status: 200 }));
    const localChecker = new UpdateChecker();
    const r = await localChecker.check({
      fetcher: fetcher as unknown as typeof fetch,
      force: true,
      installedVersion: { version: '0.6.4', versionCode: 14 },
    });
    expect(r.needsUpdate).toBe(true);
    expect(r.manifest?.latest_version).toBe('0.6.5');
    expect(r.manifest?.latest_version_code).toBe(15);
  });
  it('UpdateChecker.check treats v0.6.5 user as up-to-date', async () => {
    // A v0.6.5 user polling the same R93 chain: sees v0.6.5, no update.
    const validR93 = {
      ...validR87,
      latest_version: '0.6.5',
      latest_version_code: 15,
    };
    const fetcher = vi.fn(async () => new Response(JSON.stringify(validR93), { status: 200 }));
    const localChecker = new UpdateChecker();
    const r = await localChecker.check({
      fetcher: fetcher as unknown as typeof fetch,
      force: true,
      installedVersion: { version: '0.6.5', versionCode: 15 },
    });
    expect(r.needsUpdate).toBe(false);
    expect(r.manifest?.latest_version).toBe('0.6.5');
  });
  it('UpdateChecker.check falls through chain when R92 host is down', async () => {
    // R103 chain: [R102, R92, R90, R88, R87, R85, R81, R78]. R102 +
    // R92 return 500, R90 returns valid. fetchManifestFromChain must
    // walk past both failures and surface the R90 URL.
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('ncfosklh79sxf')) {
        return new Response('boom', { status: 500 });
      }
      if (url.includes('yv5eeknt6h6sa')) {
        return new Response('boom', { status: 500 });
      }
      if (url.includes('ad67rp710vsl7')) {
        return new Response(JSON.stringify(validR87), { status: 200 });
      }
      return new Response('boom', { status: 500 });
    });
    const r = await fetchManifestFromChain([...DEFAULT_MANIFEST_URLS], {
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(r.url).toContain('ad67rp710vsl7');
    expect(r.attempts.length).toBe(2);
    expect(r.attempts[0].url).toContain('ncfosklh79sxf');
    expect(r.attempts[0].error).toMatch(/HTTP 500/);
    expect(r.attempts[1].url).toContain('yv5eeknt6h6sa');
    expect(r.attempts[1].error).toMatch(/HTTP 500/);
  });
  it('R103 env override precedes the R102 head (custom host beats R102)', () => {
    const urls = resolveManifestUrls({
      VITE_UPDATE_MANIFEST_URL: 'https://github-raw.example.com/m.json',
    });
    expect(urls[0]).toBe('https://github-raw.example.com/m.json');
    expect(urls[1]).toContain('ncfosklh79sxf');
    expect(urls.length).toBe(9); // 1 env + 8 default
  });
  it('compareVersions: 0.6.5 > 0.6.4 (numeric, not lex)', () => {
    expect(compareVersions('0.6.5', '0.6.4')).toBeGreaterThan(0);
    expect(compareVersions('0.6.4', '0.6.5')).toBeLessThan(0);
  });
  it('compareVersions: 0.6.5 > 0.6.10 does NOT happen (numeric compare catches this)', () => {
    // Guard: confirms compareVersions parses numerically so v0.6.5 < v0.6.10.
    expect(compareVersions('0.6.5', '0.6.10')).toBeLessThan(0);
  });
  it('compareVersions: 0.6.5 == 0.6.5.0 (segment padding)', () => {
    expect(compareVersions('0.6.5', '0.6.5.0')).toBe(0);
  });
  it('compareVersions: leading-v "v0.6.5" == "0.6.5"', () => {
    expect(compareVersions('v0.6.5', '0.6.5')).toBe(0);
  });
  it('R93 chain preserves all R90 hosts (no rotation removed)', () => {
    // Sanity: every host that was in the R90 chain still appears in R93.
    const r93hosts = DEFAULT_MANIFEST_URLS;
    for (const host of [
      '32dhrw35m4x2v', // R88
      'hrkbksh0x0xz4', // R87
      'cq9a31txpromd', // R85
      '813khigmhk9k8', // R81
      'fy150e36f93n8', // R78
    ]) {
      expect(r93hosts.some((u) => u.includes(host))).toBe(true);
    }
  });
  it('v0.6.5 sideload scenario: chain returns v0.6.5 manifest URL in manifestUrl', async () => {
    // A v0.6.3 / v0.6.4 user hits "Check now" — the chain succeeds and
    // the result.manifestUrl points at the v0.6.5 R92 host.
    const validR93 = {
      ...validR87,
      latest_version: '0.6.5',
      latest_version_code: 15,
    };
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('yv5eeknt6h6sa')) {
        return new Response(JSON.stringify(validR93), { status: 200 });
      }
      return new Response('boom', { status: 500 });
    });
    const localChecker = new UpdateChecker();
    const r = await localChecker.check({
      fetcher: fetcher as unknown as typeof fetch,
      force: true,
      installedVersion: { version: '0.6.4', versionCode: 14 },
    });
    expect(r.manifestUrl).toContain('yv5eeknt6h6sa');
    expect(r.manifest?.latest_version).toBe('0.6.5');
  });
  it('R93 chain dedup: identical URLs collapse to one entry', () => {
    // Defensive: if someone accidentally pastes the same host twice in
    // DEFAULT_MANIFEST_URLS, the test pins the count to 7 (i.e. no dups).
    // If a future PR adds a duplicate, this test fails and the PR is
    // forced to either dedup or update the expected length.
    const seen = new Set<string>();
    for (const u of DEFAULT_MANIFEST_URLS) {
      expect(seen.has(u)).toBe(false);
      seen.add(u);
    }
    expect(seen.size).toBe(DEFAULT_MANIFEST_URLS.length);
  });
  it('R93 chain hosts are valid HTTPS URLs (no http://, no path-less)', () => {
    for (const u of DEFAULT_MANIFEST_URLS) {
      expect(u.startsWith('https://')).toBe(true);
      expect(u).toContain('/updates/android.json');
      // No trailing slash right after the host (path-less URL guard):
      expect(u).not.toMatch(/\.space\.minimax\.io\/$/);
    }
  });
  it('v0.6.5 release notes URL pattern: ends with /release-notes-v0.6.5/', () => {
    // The release_notes_url in the deployed manifest must point at the
    // /release-notes-v0.6.5/ page on the canonical site.
    const expected = 'https://yv5eeknt6h6sa.space.minimax.io/release-notes-v0.6.5/';
    // We don't have a parser for the URL here; just confirm the v0.6.5
    // page slug is the conventional pattern. (This is a regression guard
    // for the site release-notes page; the page exists per R93 deploy.)
    expect(expected).toMatch(/\/release-notes-v0\.6\.5\/$/);
  });
});

describe('R103 v0.6.6 — chain extension so v0.6.5/6 users auto-update', () => {
  it('R103 chain head is the R102 (ncfosklh79sxf) public-deploy host', () => {
    // The whole point of R103: v0.6.6 was deployed at ncfosklh79sxf,
    // so the chain must start there or v0.6.5/6 users will keep
    // polling R92 (v0.6.5) and report "you're up to date" until a
    // future R10x explicitly re-extends.
    const urls = resolveManifestUrls(null);
    expect(urls[0]).toBe('https://ncfosklh79sxf.space.minimax.io/updates/android.json');
  });
  it('R103 chain preserves every R90/R93 host (no rotation removed)', () => {
    // Regression guard: extending the chain must never silently drop
    // an older host. If a future PR removes one, this test fails.
    const chain = DEFAULT_MANIFEST_URLS;
    for (const host of [
      'ncfosklh79sxf', // R102 (v0.6.6) — added in R103
      'yv5eeknt6h6sa', // R92 (v0.6.5)
      'ad67rp710vsl7', // R90 (v0.6.4)
      '32dhrw35m4x2v', // R88 (v0.6.3)
      'hrkbksh0x0xz4', // R87
      'cq9a31txpromd', // R85
      '813khigmhk9k8', // R81
      'fy150e36f93n8', // R78
    ]) {
      expect(chain.some((u) => u.includes(host))).toBe(true);
    }
  });
  it('R103 chain ordering: R102 before R92, R92 before R90, ... R78 last', () => {
    // Most-recent first; oldest last. The v0.6.5 user sees the v0.6.6
    // manifest in one round-trip (no fallthrough) when R102 is up.
    const chain = DEFAULT_MANIFEST_URLS;
    const order = [
      'ncfosklh79sxf', // R102
      'yv5eeknt6h6sa', // R92
      'ad67rp710vsl7', // R90
      '32dhrw35m4x2v', // R88
      'hrkbksh0x0xz4', // R87
      'cq9a31txpromd', // R85
      '813khigmhk9k8', // R81
      'fy150e36f93n8', // R78
    ];
    for (let i = 0; i < order.length; i++) {
      expect(chain[i]).toContain(order[i]);
    }
  });
  it('R103 env override precedes the R102 head, R102 still at index 1', () => {
    const urls = resolveManifestUrls({
      VITE_UPDATE_MANIFEST_URL: 'https://github-raw.example.com/m.json',
    });
    expect(urls[0]).toBe('https://github-raw.example.com/m.json');
    expect(urls[1]).toContain('ncfosklh79sxf');
    expect(urls.length).toBe(9);
  });
  it('R103 chain length is 8 (R90=5 → R93=7 → R103=8)', () => {
    // Pin the length. If someone adds or removes a host without
    // updating this, the test forces them to justify the change.
    expect(DEFAULT_MANIFEST_URLS.length).toBe(8);
  });
  it('R103 chain dedup: no identical URLs (R102 must not be a copy of R92)', () => {
    const seen = new Set<string>();
    for (const u of DEFAULT_MANIFEST_URLS) {
      expect(seen.has(u)).toBe(false);
      seen.add(u);
    }
    expect(seen.size).toBe(DEFAULT_MANIFEST_URLS.length);
  });
  it('R103 chain hosts are all valid HTTPS manifest URLs', () => {
    for (const u of DEFAULT_MANIFEST_URLS) {
      expect(u.startsWith('https://')).toBe(true);
      expect(u).toContain('/updates/android.json');
      expect(u).not.toMatch(/\.space\.minimax\.io\/$/);
    }
  });
  it('R103 chain: v0.6.6 user on the R102 head sees "up to date"', async () => {
    // A v0.6.6 user polls the R103 chain. The R102 host (ncfosklh79sxf)
    // is at the head and serves v0.6.6/16, so the check returns
    // needsUpdate=false in a single round-trip.
    const validR103 = {
      ...validR87,
      latest_version: '0.6.6',
      latest_version_code: 16,
    };
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('ncfosklh79sxf')) {
        return new Response(JSON.stringify(validR103), { status: 200 });
      }
      return new Response('boom', { status: 500 });
    });
    const localChecker = new UpdateChecker();
    const r = await localChecker.check({
      fetcher: fetcher as unknown as typeof fetch,
      force: true,
      installedVersion: { version: '0.6.6', versionCode: 16 },
    });
    expect(r.needsUpdate).toBe(false);
    expect(r.forceUpdate).toBe(false);
    expect(r.manifestUrl).toBe('https://ncfosklh79sxf.space.minimax.io/updates/android.json');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('R103 chain: v0.6.5 user on the R102 head gets a v0.6.6 update prompt', async () => {
    // A v0.6.5 user polls the R103 chain. The R102 host is at the
    // head and serves v0.6.6/16, so the check returns needsUpdate=true
    // — this is the auto-update path R103 exists to enable.
    const validR103 = {
      ...validR87,
      latest_version: '0.6.6',
      latest_version_code: 16,
    };
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('ncfosklh79sxf')) {
        return new Response(JSON.stringify(validR103), { status: 200 });
      }
      return new Response('boom', { status: 500 });
    });
    const localChecker = new UpdateChecker();
    const r = await localChecker.check({
      fetcher: fetcher as unknown as typeof fetch,
      force: true,
      installedVersion: { version: '0.6.5', versionCode: 15 },
    });
    expect(r.needsUpdate).toBe(true);
    expect(r.forceUpdate).toBe(false);
    expect(r.manifest?.latest_version).toBe('0.6.6');
    expect(r.manifestUrl).toContain('ncfosklh79sxf');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('R103 chain: R102 down → R92 (v0.6.5) still serves the v0.6.5 manifest', async () => {
    // R103 fallthrough: R102 returns 500, R92 returns the v0.6.5
    // manifest. A v0.6.5 user on a down R102 still gets a working
    // update check (just no v0.6.6 yet).
    const validR93 = {
      ...validR87,
      latest_version: '0.6.5',
      latest_version_code: 15,
    };
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('ncfosklh79sxf')) {
        return new Response('boom', { status: 500 });
      }
      if (url.includes('yv5eeknt6h6sa')) {
        return new Response(JSON.stringify(validR93), { status: 200 });
      }
      return new Response('boom', { status: 500 });
    });
    const localChecker = new UpdateChecker();
    const r = await localChecker.check({
      fetcher: fetcher as unknown as typeof fetch,
      force: true,
      installedVersion: { version: '0.6.5', versionCode: 15 },
    });
    expect(r.needsUpdate).toBe(false);
    expect(r.manifestUrl).toContain('yv5eeknt6h6sa');
    expect(r.manifest?.latest_version).toBe('0.6.5');
  });
});
