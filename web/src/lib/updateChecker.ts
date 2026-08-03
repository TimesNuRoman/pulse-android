/**
 * updateChecker — in-app update checker for Pulse Notes Android.
 *
 * Fetches /updates/android.json on the live site, compares the
 * reported latest_version / latest_version_code with the installed
 * build, and returns an UpdateInfo the UI can render. Cached in
 * localStorage for 24h to avoid hammering the origin.
 *
 * Schema (deployed by R121 on https://ownlocalml.com/updates/android.json):
 *   {
 *     "platform": "android",
 *     "latest_version": "0.6.7",
 *     "latest_version_code": 17,
 *     "min_supported_version": "0.5.0",
 *     "force_update_below": "0.5.0",
 *     "download_url": "https://ownlocalml.com/downloads/pulse-notes-0.6.7.apk",
 *     "signature_sha256": "47f5e91...6a6730",
 *     "release_notes": "v0.6.7 release notes...",
 *     "versions": [ ... ]
 *   }
 *
 * Public API:
 *   - checkForUpdate(currentVersion, currentCode) -> UpdateInfo | null
 *       Always resolves; returns null on any error (network, parse,
 *       timeout, missing field). Never throws — the caller just
 *       renders nothing on null.
 *
 *   - getCachedUpdate() -> UpdateInfo | null
 *       Pure read of the localStorage cache; no network. Used by the
 *       banner for instant first paint before the first check resolves.
 *
 *   - clearCache()
 *       Drops the localStorage cache. Used by "Check now" buttons or
 *       debug surfaces.
 *
 *   - isDismissedFor(latestVersion) -> boolean
 *       Per-version dismiss flag (× button on the banner). Re-appears
 *       automatically on a version bump.
 *
 *   - dismissFor(latestVersion)
 *       Persist the dismiss flag.
 *
 * Cache TTL: 24h. Storing the last result (whether update or no-update)
 * means a fresh APK landing within the TTL is invisible until the
 * window expires. That's an intentional tradeoff vs hammering the
 * origin; see the R164 report's "open questions" for the longer
 * discussion.
 *
 * Timeout: 5s for the manifest fetch. Uses AbortController; abort fires
 * DOMException(name="AbortError") which we catch and return null.
 */
import { APP_VERSION, APP_VERSION_CODE } from './version';

// ---------- Constants ----------

/** Manifest URL relative to the WebView origin. Works in both the
 *  Capacitor WebView (served from the bundled site) and a plain
 *  browser pointed at the live site. */
export const MANIFEST_URL = '/updates/android.json';

/** 5s hard cap on the manifest fetch. */
export const FETCH_TIMEOUT_MS = 5000;

/** 24h between remote checks. */
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const STORAGE_RESULT_KEY = 'pulse.updateCheck.lastResult.v1';
const STORAGE_TIMESTAMP_KEY = 'pulse.updateCheck.lastCheck.v1';
const STORAGE_DISMISSED_KEY = 'pulse.updateCheck.dismissed.v1';

// ---------- Types ----------

/** What the UI consumes. `null` is reserved for "no info" (error or
 *  no result yet). When checkForUpdate resolves, you always get an
 *  UpdateInfo back unless something went wrong. */
export interface UpdateInfo {
  isUpdateAvailable: boolean;
  isForceUpdate: boolean;
  latestVersion: string;
  latestCode: number;
  downloadUrl: string;
  releaseNotes: string;
}

/** Minimal manifest shape — only the fields we use. Extra fields
 *  (versions[], signature_sha256, etc.) are accepted but ignored. */
interface Manifest {
  platform?: string;
  latest_version: string;
  latest_version_code: number;
  min_supported_version?: string;
  force_update_below?: string;
  download_url: string;
  signature_sha256?: string;
  release_notes?: string;
  versions?: unknown;
}

// ---------- Version comparison ----------

/**
 * Compare two semver-ish version strings ("0.6.2", "1.10.0", "0.6").
 * Returns negative if a < b, 0 if equal, positive if a > b. Non-numeric
 * segments are coerced via parseInt; missing segments are treated as 0.
 *
 * Mirror of the helper in lib/update-checker/update-checker.ts (R88) —
 * duplicated here so this module has zero deps on the legacy
 * update-checker. Migrating that file to import from here is a
 * future R-round (out of scope for R164 per the brief).
 */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const ai = pa[i] ?? 0;
    const bi = pb[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}

function parseVersion(v: string): number[] {
  if (typeof v !== 'string') return [0];
  const cleaned = v.trim().replace(/^v/i, '').split('-')[0] ?? '';
  const parts = cleaned.split('.');
  const out: number[] = [];
  for (const p of parts) {
    const n = parseInt(p, 10);
    out.push(Number.isFinite(n) ? n : 0);
  }
  return out.length > 0 ? out : [0];
}

// ---------- Storage helpers ----------

function safeGet(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
  } catch {
    // private mode / quota — silent. The check still works, just
    // doesn't persist across launches.
  }
}

function safeRemove(key: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// ---------- Cached result read / write ----------

function readCache(): { info: UpdateInfo; checkedAt: number } | null {
  const result = safeGet(STORAGE_RESULT_KEY);
  const ts = safeGet(STORAGE_TIMESTAMP_KEY);
  if (!result || !ts) return null;
  const checkedAt = Number(ts);
  if (!Number.isFinite(checkedAt)) return null;
  try {
    const info = JSON.parse(result) as UpdateInfo;
    if (
      typeof info !== 'object' ||
      info === null ||
      typeof info.isUpdateAvailable !== 'boolean' ||
      typeof info.latestVersion !== 'string' ||
      typeof info.downloadUrl !== 'string'
    ) {
      return null;
    }
    return { info, checkedAt };
  } catch {
    return null;
  }
}

function writeCache(info: UpdateInfo, checkedAt: number): void {
  safeSet(STORAGE_RESULT_KEY, JSON.stringify(info));
  safeSet(STORAGE_TIMESTAMP_KEY, String(checkedAt));
}

// ---------- Public API ----------

/**
 * Read the cached UpdateInfo without making a network request. Returns
 * null if no cache, cache is corrupt, or cache TTL has expired.
 */
export function getCachedUpdate(): UpdateInfo | null {
  const cached = readCache();
  if (!cached) return null;
  if (Date.now() - cached.checkedAt > CACHE_TTL_MS) return null;
  return cached.info;
}

/**
 * Drop the localStorage cache. The next checkForUpdate call will
 * re-fetch. Use this from a "Check now" button or for debug.
 */
export function clearCache(): void {
  safeRemove(STORAGE_RESULT_KEY);
  safeRemove(STORAGE_TIMESTAMP_KEY);
}

/**
 * Was the banner dismissed for the given latest version? Per-version:
 * dismissing v0.6.7 does not hide a future v0.6.8 banner.
 */
export function isDismissedFor(latestVersion: string): boolean {
  return safeGet(STORAGE_DISMISSED_KEY) === latestVersion;
}

/**
 * Persist the dismiss flag for the given version.
 */
export function dismissFor(latestVersion: string): void {
  safeSet(STORAGE_DISMISSED_KEY, latestVersion);
}

/**
 * Un-dismiss (used by tests; can also be wired to a hidden "reset
 * update banner" debug surface later).
 */
export function clearDismissed(): void {
  safeRemove(STORAGE_DISMISSED_KEY);
}

export interface CheckOptions {
  /** Override fetch (used by tests). */
  fetcher?: typeof fetch;
  /** Per-call timeout in ms. Default 5000. */
  timeoutMs?: number;
  /** Bypass the localStorage cache (used by tests). */
  bypassCache?: boolean;
  /** Bypass the network (returns the cached result without writing —
   *  used by tests that want to verify cache returns without a fetch). */
  forceCache?: boolean;
}

/**
 * Check the manifest for a newer version. Always resolves; never
 * throws. Returns null on any error so the caller can do
 * `if (info?.isUpdateAvailable) render()`.
 */
export async function checkForUpdate(
  currentVersion: string = APP_VERSION,
  currentCode: number = APP_VERSION_CODE,
  opts: CheckOptions = {},
): Promise<UpdateInfo | null> {
  // 1. Return cached result if fresh (24h debounce) and not bypassed.
  if (!opts.bypassCache && !opts.forceCache) {
    const cached = getCachedUpdate();
    if (cached) return cached;
  }

  if (opts.forceCache) {
    const cached = readCache();
    return cached ? cached.info : null;
  }

  // 2. Fetch the manifest with a 5s timeout.
  const fetcher = opts.fetcher ?? (typeof fetch !== 'undefined' ? fetch : undefined);
  if (typeof fetcher !== 'function') {
    return null;
  }

  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetcher(MANIFEST_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch {
    // Network error, abort, DNS, CORS — all surface here. Silent
    // return: the banner just doesn't appear.
    clearTimeout(timer);
    return null;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    return null;
  }

  let manifest: Manifest;
  try {
    const data = (await res.json()) as unknown;
    manifest = parseManifest(data);
  } catch {
    return null;
  }

  const info = buildUpdateInfo(manifest, currentVersion, currentCode);
  writeCache(info, Date.now());
  return info;
}

function parseManifest(input: unknown): Manifest {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Manifest must be an object');
  }
  const m = input as Record<string, unknown>;
  const string_ = (key: string): string => {
    const v = m[key];
    if (typeof v !== 'string' || v.length === 0) {
      throw new Error(`Manifest missing string field: ${key}`);
    }
    return v;
  };
  const number_ = (key: string): number => {
    const v = m[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = parseInt(v, 10);
      if (Number.isFinite(n)) return n;
    }
    throw new Error(`Manifest missing number field: ${key}`);
  };
  return {
    platform: typeof m['platform'] === 'string' ? (m['platform'] as string) : undefined,
    latest_version: string_('latest_version'),
    latest_version_code: number_('latest_version_code'),
    min_supported_version:
      typeof m['min_supported_version'] === 'string' ? (m['min_supported_version'] as string) : undefined,
    force_update_below:
      typeof m['force_update_below'] === 'string' ? (m['force_update_below'] as string) : undefined,
    download_url: string_('download_url'),
    signature_sha256:
      typeof m['signature_sha256'] === 'string' ? (m['signature_sha256'] as string) : undefined,
    release_notes: typeof m['release_notes'] === 'string' ? (m['release_notes'] as string) : undefined,
    versions: m['versions'],
  };
}

function buildUpdateInfo(manifest: Manifest, currentVersion: string, currentCode: number): UpdateInfo {
  const isNewer = compareVersions(currentVersion, manifest.latest_version) < 0;
  const isNewerByCode =
    !isNewer && typeof manifest.latest_version_code === 'number'
      ? currentCode < manifest.latest_version_code
      : false;
  const isUpdateAvailable = isNewer || isNewerByCode;

  const forceThreshold = manifest.force_update_below ?? manifest.min_supported_version ?? '';
  const isForceUpdate = forceThreshold.length > 0 && compareVersions(currentVersion, forceThreshold) < 0;

  return {
    isUpdateAvailable,
    isForceUpdate,
    latestVersion: manifest.latest_version,
    latestCode: manifest.latest_version_code,
    downloadUrl: manifest.download_url,
    releaseNotes: manifest.release_notes ?? '',
  };
}
