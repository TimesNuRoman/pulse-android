/**
 * UpdateChecker — in-app update checker for Pulse Notes Android.
 *
 * R88 revive. R52 originally shipped an UpdateChecker that was lost in
 * the R73 mavis-trash incident and never recovered after the R77
 * greenfield reset. This module is a fresh implementation that follows
 * the same pattern: poll a remote manifest on app launch, compare with
 * the installed version, surface an in-app dialog when an update is
 * available (mandatory when below `force_update_below`).
 *
 * R90: added manifest URL fallback chain. Each `website_deploy` call
 * creates a NEW host URL, so the v0.6.3 APK's baked-in URL
 * (`hrkbksh0x0xz4`) became orphaned the moment the R88 manifest moved
 * to `32dhrw35m4x2v`. v0.6.4+ tries a chain of known hosts in order
 * and uses the first one that returns a parseable manifest. The first
 * entry in the chain is the env override (so a future build can
 * pin to a single host), the rest are the recent canonical hosts.
 *
 * R93: v0.6.3 → v0.6.4 update path was architecturally broken (v0.6.3
 * APK's `DEFAULT_MANIFEST_URL` was a single URL, not the chain, so it
 * kept polling the retired R87 host and never saw v0.6.4). v0.6.5 is
 * the bridge release — the chain now starts with R92's `yv5eeknt6h6sa`
 * (the new full-site canonical from R92 site-sync) so v0.6.5+ devices
 * can auto-update forward. v0.6.3 / v0.6.4 users still need to
 * side-load v0.6.5 (see the release-notes-v0.6.5 page on the site).
 *
 * R103: v0.6.6 was deployed at a new host (`ncfosklh79sxf`), but the
 * R93 chain did not know about it — v0.6.5/6 users polling the chain
 * would only see the R92 host's manifest (v0.6.5) and report "your
 * version is up to date" even when a v0.6.7 lands. The chain now
 * starts with R102's `ncfosklh79sxf` (the actual public deploy of
 * v0.6.6) so v0.6.5+ users auto-update forward. R92 / R90 / R88 / R87
 * / R85 / R81 / R78 are preserved below it as fallbacks.
 *
 * Manifest schema (matches the deployed R87 host, with brief's flat
 * aliases as fallbacks for forward-compat):
 *   {
 *     "latest_version": "0.6.2",                  // required, semver-ish
 *     "latest_version_code": 12,                  // required, integer
 *     "latest_apk_url": "https://.../pulse-notes-0.6.2-debug.apk",
 *     "latest_apk_size_bytes": 4551289,
 *     "latest_apk_sha256": "2F8BB218...88F60",
 *     "release_notes_url": "https://.../changelog/#v0.6.2",
 *     "min_supported_version": "0.3.0",           // below this = force
 *     "force_update_below": "0.3.0",              // alias kept for compat
 *     "versions": [ ... history, optional ... ]
 *   }
 *
 * Persistence: localStorage (Capacitor WebView supports it natively).
 * The Capacitor Preferences plugin is the future migration path if we
 * ever need native-side storage, but for v0.6.4 we keep the web/ bundle
 * a single tree-shakeable target that works in both browser and WebView.
 *
 * Cache: 24h TTL (per-launch in-flight + persistent across launches).
 *   - First check of a launch: fetch if cache stale or missing.
 *   - Subsequent checks in the same launch: return the in-memory result.
 *   - If fetch fails AND we have a cached manifest, fall back to cache
 *     and surface a non-blocking error.
 *   - If fetch fails AND no cache, return needsUpdate: false.
 */
import { isNative } from '$lib/capacitor';

// ---------- Constants ----------

/** Build-time version. Bump alongside android/app/build.gradle. */
export const APP_VERSION = '0.6.6';
export const APP_VERSION_CODE = 16;

/**
 * Default manifest URL. Retained for backward compat with R88 callers
 * that used `DEFAULT_MANIFEST_URL` directly. v0.6.4+ uses
 * `DEFAULT_MANIFEST_URLS` (the chain). New code should read the chain
 * via `getManifestUrls()` or `resolveManifestUrls(env)`.
 */
export const DEFAULT_MANIFEST_URL =
  'https://hrkbksh0x0xz4.space.minimax.io/updates/android.json';

/**
 * Default manifest URL chain (R90). Each `website_deploy` call creates
 * a new host URL, so the baked-in default for v0.6.3 became orphaned
 * the moment the R88 manifest moved to a new host. v0.6.4+ tries each
 * URL in order and uses the first one that returns a parseable
 * manifest. The chain is ordered most-recent first so the common case
 * is one round-trip; older hosts are tried only when the recent ones
 * are unreachable.
 *
 * Source of truth for the host list lives here. If you deploy a new
 * manifest, add the new host at index 0 (most recent) and rotate the
 * list over time. R0## follow-up: a stable host (GitHub raw, S3/R2)
 * is the long-term fix; this chain is the bridge.
 */
export const DEFAULT_MANIFEST_URLS: readonly string[] = [
  // R102 (v0.6.6 — current public deploy; this is the head so v0.6.5/6
  // users see v0.6.6+ without waiting for a fallback. R102's host is
  // the actual `website_deploy` URL for the v0.6.6 release — R95a /
  // R97-HOTFIX canonicals are documented separately in pulse-landing's
  // astro.config.mjs but the on-device chain follows the public deploy).
  'https://ncfosklh79sxf.space.minimax.io/updates/android.json',
  // R92 (v0.6.5 — bridge entry that lets v0.6.5+ devices auto-update
  // forward even if R90 / R88 hosts go down).
  'https://yv5eeknt6h6sa.space.minimax.io/updates/android.json',
  // R90 (v0.6.4 — chain originator, R90 had the first multi-host chain).
  'https://ad67rp710vsl7.space.minimax.io/updates/android.json',
  // R88 (v0.6.3).
  'https://32dhrw35m4x2v.space.minimax.io/updates/android.json',
  // R87 (the host baked into the v0.6.3 APK — kept for one more release).
  'https://hrkbksh0x0xz4.space.minimax.io/updates/android.json',
  // R85 (v0.6.1 era).
  'https://cq9a31txpromd.space.minimax.io/updates/android.json',
  // R81 canonical (v0.6.1).
  'https://813khigmhk9k8.space.minimax.io/updates/android.json',
  // R78 canonical (v0.6.0 — oldest still-live).
  'https://fy150e36f93n8.space.minimax.io/updates/android.json',
];

/** 24h between remote checks. */
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** localStorage key for the cached check. */
const STORAGE_KEY = 'pulse.update_checker.v1';

/** Fetch timeout (ms). Keep short — if the manifest is slow, the user
 *  doesn't need a stuck dialog. */
const FETCH_TIMEOUT_MS = 8000;

// ---------- Types ----------

/** One historical release entry from the manifest's `versions[]`. */
export interface ManifestVersionEntry {
  version: string;
  version_code: number;
  date: string;
  type: string;
  summary: string;
}

/** Validated manifest shape consumed by the rest of the app. */
export interface Manifest {
  latest_version: string;
  latest_version_code: number;
  latest_apk_url: string;
  latest_apk_size_bytes: number;
  latest_apk_sha256: string;
  release_notes_url: string;
  min_supported_version: string;
  force_update_below: string;
  versions?: ManifestVersionEntry[];
}

/** What the UI consumes from `UpdateChecker.check()`. */
export interface UpdateResult {
  /** True iff the manifest's latest_version is newer than the installed
   *  version (or the installed version is below min_supported_version). */
  needsUpdate: boolean;
  /** True iff the installed version is below `force_update_below` (or
   *  the legacy alias `min_supported_version`). When true, the dialog
   *  hides the "Later" button and disables back-button dismissal. */
  forceUpdate: boolean;
  /** The manifest that was evaluated (null only on a hard error with no
   *  cache to fall back to). */
  manifest: Manifest | null;
  /** True if this result came from the local cache (no network). */
  fromCache: boolean;
  /** When this check last ran (ms since epoch). */
  checkedAt: number;
  /** Last fetch error, or null. Surfaced to the UI as a small badge so
   *  testers can tell "we tried, the server is down" from "we're fresh
   *  and there's nothing to do". */
  error: string | null;
  /**
   * Which host URL served this manifest (R90). Null when the result
   * came from cache (no network this check) or on a hard error with
   * no cache. Useful for debugging "which deploy did the user just
   * see?" without re-fetching. Diagnostic-only — the UI does not
   * render this.
   */
  manifestUrl: string | null;
}

/** Internal cache shape. */
interface CacheState {
  manifest: Manifest;
  checkedAt: number;
  lastSeenVersion: string;
}

// ---------- Env helpers ----------

/**
 * Read a string value from the env-like object. Returns `undefined`
 * if the key is missing or the value is empty.
 */
function envString(env: Record<string, unknown> | null | undefined, key: string): string | undefined {
  if (!env) return undefined;
  const v = env[key];
  if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  return undefined;
}

/** Read a number value from the env-like object. */
function envNumber(env: Record<string, unknown> | null | undefined, key: string): number | undefined {
  if (!env) return undefined;
  const v = env[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/**
 * Pure helper: pick a manifest URL out of an env object. Exposed for
 * tests that need to verify env resolution without poking at
 * `import.meta.env` (which is read-only in vitest).
 *
 * Retained for R88 callers. v0.6.4+ should prefer `resolveManifestUrls`.
 */
export function resolveManifestUrl(env: Record<string, unknown> | null | undefined): string {
  return envString(env, 'VITE_UPDATE_MANIFEST_URL') ?? DEFAULT_MANIFEST_URL;
}

/**
 * Pure helper: pick an ordered list of manifest URLs out of an env
 * object (R90). The env override (when set) is always at the head of
 * the chain so a future build can pin to a single host without
 * touching the chain. Default chain comes from `DEFAULT_MANIFEST_URLS`
 * (most-recent first).
 *
 * Empty / whitespace entries are filtered out so a typo in a CI env
 * var can't break the chain silently.
 */
export function resolveManifestUrls(env: Record<string, unknown> | null | undefined): string[] {
  const envOverride = envString(env, 'VITE_UPDATE_MANIFEST_URL');
  const chain: string[] = [];
  if (envOverride) chain.push(envOverride);
  for (const url of DEFAULT_MANIFEST_URLS) {
    if (typeof url === 'string' && url.trim().length > 0) chain.push(url);
  }
  return chain;
}

/**
 * Pure helper: pick the installed version out of an env object.
 * Exposed for tests.
 */
export function resolveInstalledVersion(
  env: Record<string, unknown> | null | undefined,
): { version: string; versionCode: number } {
  return {
    version: envString(env, 'VITE_APP_VERSION') ?? APP_VERSION,
    versionCode: envNumber(env, 'VITE_APP_VERSION_CODE') ?? APP_VERSION_CODE,
  };
}

/** Safe access to `import.meta.env` that doesn't throw in non-Vite
 *  contexts (vitest config, plain node). */
function readViteEnv(): Record<string, unknown> | null {
  try {
    const env = (import.meta as { env?: Record<string, unknown> }).env;
    return env ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve the manifest URL from the build-time env var, with a sane
 * default. Vite injects `import.meta.env.VITE_UPDATE_MANIFEST_URL` at
 * build time; an empty string falls back to the default.
 *
 * Retained for R88 callers. v0.6.4+ should prefer `getManifestUrls`.
 */
export function getManifestUrl(): string {
  return resolveManifestUrl(readViteEnv());
}

/**
 * Resolve the manifest URL chain from the build-time env (R90). The
 * chain is tried in order by `fetchManifestFromChain`; the first
 * parseable response wins. See `DEFAULT_MANIFEST_URLS` for the
 * rotation history and the rationale.
 */
export function getManifestUrls(): string[] {
  return resolveManifestUrls(readViteEnv());
}

/**
 * Resolve the installed version. Prefers build-time env vars
 * (VITE_APP_VERSION, VITE_APP_VERSION_CODE) so a future native-side
 * write to Capacitor Preferences can be wired up by MainActivity
 * without touching this module. Falls back to the build constants
 * (which MUST match android/app/build.gradle).
 */
export function getInstalledVersion(): { version: string; versionCode: number } {
  return resolveInstalledVersion(readViteEnv());
}

// ---------- Version comparison ----------

/**
 * Compare two semver-ish version strings ("0.6.2", "1.10.0", "0.6").
 * Returns negative if a < b, 0 if equal, positive if a > b. Non-numeric
 * segments are coerced via parseInt; missing segments are treated as 0.
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
  // Strip leading 'v' (some manifests use "v0.6.2"), drop pre-release
  // suffix for the numeric compare ("0.6.2-beta" -> "0.6.2"). This is
  // a compare, not a sort key, so we don't need the full semver spec.
  const cleaned = v.trim().replace(/^v/i, '').split('-')[0] ?? '';
  const parts = cleaned.split('.');
  const out: number[] = [];
  for (const p of parts) {
    const n = parseInt(p, 10);
    out.push(Number.isFinite(n) ? n : 0);
  }
  return out.length > 0 ? out : [0];
}

/**
 * Should the dialog force the update? True iff the installed version
 * is strictly below the `force_update_below` (or the alias
 * `min_supported_version`) threshold. Equal is fine — only an older
 * version is forced.
 */
export function shouldForceUpdate(installed: string, min: string): boolean {
  return compareVersions(installed, min) < 0;
}

/**
 * Should we prompt for an update? True iff the manifest version is
 * strictly newer than the installed version OR the installed version
 * is below the force threshold. The caller is responsible for choosing
 * how to surface each case (the dialog uses `forceUpdate` to decide
 * between soft-prompt vs block).
 */
export function shouldPromptUpdate(
  installed: string,
  manifest: Manifest,
): { needsUpdate: boolean; forceUpdate: boolean } {
  const forceUpdate =
    shouldForceUpdate(installed, manifest.force_update_below) ||
    shouldForceUpdate(installed, manifest.min_supported_version);
  const isNewer = compareVersions(installed, manifest.latest_version) < 0;
  return { needsUpdate: forceUpdate || isNewer, forceUpdate };
}

// ---------- Manifest parsing & fetching ----------

/**
 * Validate and normalize a manifest object. Throws on missing required
 * fields. Accepts both the deployed R87 schema (latest_*) and the
 * brief's flat aliases (apk_url, sha256, size, version_code,
 * min_supported) as fallbacks — the brief docs lead, the host is
 * canonical.
 */
export function parseManifest(input: unknown): Manifest {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Manifest must be an object');
  }
  const m = input as Record<string, unknown>;

  const string_ = (key: string, ...alts: string[]): string => {
    for (const k of [key, ...alts]) {
      const v = m[k];
      if (typeof v === 'string' && v.length > 0) return v;
    }
    throw new Error(`Manifest missing string field: ${key}`);
  };

  const number_ = (key: string, ...alts: string[]): number => {
    for (const k of [key, ...alts]) {
      const v = m[k];
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string') {
        const n = parseInt(v, 10);
        if (Number.isFinite(n)) return n;
      }
    }
    throw new Error(`Manifest missing number field: ${key}`);
  };

  const versionsRaw = m['versions'];
  let versions: ManifestVersionEntry[] | undefined;
  if (Array.isArray(versionsRaw)) {
    versions = versionsRaw.filter(
      (v): v is ManifestVersionEntry =>
        typeof v === 'object' &&
        v !== null &&
        typeof (v as Record<string, unknown>)['version'] === 'string' &&
        typeof (v as Record<string, unknown>)['version_code'] === 'number',
    );
    if (versions.length === 0) versions = undefined;
  }

  return {
    latest_version: string_('latest_version'),
    latest_version_code: number_('latest_version_code', 'version_code'),
    latest_apk_url: string_('latest_apk_url', 'apk_url'),
    latest_apk_size_bytes: number_('latest_apk_size_bytes', 'size'),
    latest_apk_sha256: string_('latest_apk_sha256', 'sha256'),
    release_notes_url: string_('release_notes_url'),
    min_supported_version: string_('min_supported_version', 'min_supported'),
    force_update_below: string_('force_update_below'),
    versions,
  };
}

export interface FetchOptions {
  /** Override fetch (used by tests). */
  fetcher?: typeof fetch;
  /** Request timeout in ms. Default 8000. */
  timeoutMs?: number;
  /** Abort signal (caller-controlled). */
  signal?: AbortSignal;
}

/**
 * Result of a fallback-chain manifest fetch (R90). Includes the URL
 * that succeeded so the caller can surface "served by host X" in
 * diagnostics or a debug badge.
 */
export interface FetchChainResult {
  manifest: Manifest;
  /** The URL that returned the parseable manifest. */
  url: string;
  /** Per-URL error messages for the URLs that failed. Empty when the
   *  first URL succeeded. Useful for the diagnostic `error` field on
   *  the final `UpdateResult` (so testers can see "tried 3 hosts,
   *  used #3"). */
  attempts: Array<{ url: string; error: string }>;
}

/**
 * Fetch and parse a manifest from `url`. Throws on HTTP error, parse
 * error, or timeout. Caller is responsible for the cache fallback.
 */
export async function fetchManifest(url: string, opts: FetchOptions = {}): Promise<Manifest> {
  const f = opts.fetcher ?? (typeof fetch !== 'undefined' ? fetch : undefined);
  if (typeof f !== 'function') {
    throw new Error('fetch is not available in this environment');
  }
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // If the caller passed a signal, chain its abort into ours.
  const onCallerAbort = (): void => controller.abort();
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener('abort', onCallerAbort, { once: true });
  }
  try {
    const res = await f(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Manifest HTTP ${res.status} ${res.statusText || ''}`.trim());
    }
    const data = (await res.json()) as unknown;
    return parseManifest(data);
  } finally {
    clearTimeout(timer);
    if (opts.signal) opts.signal.removeEventListener('abort', onCallerAbort);
  }
}

/**
 * Try each URL in `urls` in order; the first one that returns a
 * parseable manifest wins. R90: this is the fix for the chicken-and-
 * egg URL rotation problem (each `website_deploy` returns a new host,
 * so the URL baked into the v0.6.3 APK became orphaned the moment
 * the R88 manifest moved).
 *
 * Failures are non-fatal: an HTTP 404, parse error, or timeout on one
 * URL just moves on to the next. The full attempt log is returned
 * alongside the winner so the caller can surface "served by host X
 * (3 attempts)" in a diagnostic badge.
 *
 * Empty input throws — the caller must supply at least one URL. A
 * thrown error means ALL URLs failed; the error message lists each
 * failure so a tester can see the full attempt log in one place.
 */
export async function fetchManifestFromChain(
  urls: string[],
  opts: FetchOptions = {},
): Promise<FetchChainResult> {
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error('fetchManifestFromChain requires at least one URL');
  }
  const attempts: Array<{ url: string; error: string }> = [];
  for (const url of urls) {
    try {
      const manifest = await fetchManifest(url, opts);
      return { manifest, url, attempts };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      attempts.push({ url, error: msg });
    }
  }
  const summary = attempts
    .map((a) => `${a.url} -> ${a.error}`)
    .join(' | ');
  throw new Error(`All ${urls.length} manifest URLs failed: ${summary}`);
}

// ---------- Storage helpers ----------

function readCache(): CacheState | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>)['checkedAt'] === 'number' &&
      typeof (parsed as Record<string, unknown>)['lastSeenVersion'] === 'string' &&
      typeof (parsed as Record<string, unknown>)['manifest'] === 'object' &&
      (parsed as Record<string, unknown>)['manifest'] !== null
    ) {
      return parsed as CacheState;
    }
    return null;
  } catch {
    return null;
  }
}

function writeCache(state: CacheState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota / private mode — ignore
  }
}

function clearCacheStorage(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ---------- The checker ----------

export interface CheckOptions {
  /** Force a network fetch even if cache is fresh. Used by tests. */
  force?: boolean;
  /** Override fetch (used by tests). */
  fetcher?: typeof fetch;
  /** Override "now" (used by tests). */
  now?: () => number;
  /**
   * Override the manifest URL (single-URL shortcut, used by tests).
   * Mutually exclusive with `urls` — when both are passed, `urls`
   * wins. Production callers omit this and we read the chain.
   */
  url?: string;
  /**
   * Override the manifest URL chain (used by tests). When omitted we
   * resolve via `getManifestUrls()` which honors the env override and
   * the `DEFAULT_MANIFEST_URLS` chain. R90.
   */
  urls?: string[];
  /**
   * Override the installed version. Production callers omit this and
   * we read VITE_APP_VERSION / APP_VERSION. Tests pass it explicitly
   * because `import.meta.env` is hard to mutate in vitest.
   */
  installedVersion?: { version: string; versionCode: number };
}

/**
 * UpdateChecker — one singleton per process. Lazy-fetches, caches, and
 * evaluates a manifest against the installed version.
 *
 * The exported `updateChecker` is the default instance. Tests can also
 * instantiate a fresh `new UpdateChecker()` to keep state isolated.
 */
export class UpdateChecker {
  private inFlight: Promise<UpdateResult> | null = null;

  /** Test seam: reset the in-memory in-flight pointer between cases. */
  resetInFlight(): void {
    this.inFlight = null;
  }

  /**
   * Run a check. Returns the cached result if the cache is fresh and
   * the manifest version is unchanged; otherwise fetches.
   *
   * The in-flight promise is shared across all callers within a
   * single launch — `force` only affects the cache-vs-network choice,
   * not the dedup.
   */
  async check(opts: CheckOptions = {}): Promise<UpdateResult> {
    if (this.inFlight) return this.inFlight;
    const promise = (async (): Promise<UpdateResult> => {
      try {
        return await this._check(opts);
      } finally {
        this.inFlight = null;
      }
    })();
    this.inFlight = promise;
    return promise;
  }

  private async _check(opts: CheckOptions): Promise<UpdateResult> {
    const now = (opts.now ?? Date.now)();
    // Resolve the manifest URL chain (R90). `urls` test override wins;
    // otherwise we use the singleton's chain (env + DEFAULT_MANIFEST_URLS).
    // A legacy single-URL `url` is treated as a 1-element chain so R88
    // tests keep working.
    const urls =
      opts.urls ?? (opts.url ? [opts.url] : getManifestUrls());
    const installed = opts.installedVersion ?? getInstalledVersion();
    // Always read the cache — even on `force`, we want it as a
    // fallback when the network call fails.
    const cache = readCache();
    const cacheFresh =
      !opts.force && cache !== null && now - cache.checkedAt < CACHE_TTL_MS;

    if (cacheFresh && cache) {
      const evalResult = shouldPromptUpdate(installed.version, cache.manifest);
      return {
        needsUpdate: evalResult.needsUpdate,
        forceUpdate: evalResult.forceUpdate,
        manifest: cache.manifest,
        fromCache: true,
        checkedAt: cache.checkedAt,
        error: null,
        // Cache didn't come from a network fetch this turn — we don't
        // know which URL served it (and it might have been rotated out
        // of the chain since). Diagnostic-only field, null is fine.
        manifestUrl: null,
      };
    }

    try {
      const { manifest, url: servedUrl, attempts } = await fetchManifestFromChain(urls, {
        fetcher: opts.fetcher,
      });
      // If we fell back, surface the failed attempts in the error
      // field so a tester can see "tried 2 hosts, used #2".
      const fallbackNote = attempts.length > 0
        ? ` (after ${attempts.length} failed: ${attempts
            .map((a) => `${a.url.replace(/^https?:\/\//, '')}: ${a.error}`)
            .join('; ')})`
        : '';
      writeCache({
        manifest,
        checkedAt: now,
        lastSeenVersion: manifest.latest_version,
      });
      const evalResult = shouldPromptUpdate(installed.version, manifest);
      return {
        needsUpdate: evalResult.needsUpdate,
        forceUpdate: evalResult.forceUpdate,
        manifest,
        fromCache: false,
        checkedAt: now,
        error: fallbackNote || null,
        manifestUrl: servedUrl,
      };
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      // Fall back to stale cache if we have one — better to show a
      // slightly stale "update available" than to pretend nothing's
      // wrong on a flaky network.
      if (cache) {
        const evalResult = shouldPromptUpdate(installed.version, cache.manifest);
        return {
          needsUpdate: evalResult.needsUpdate,
          forceUpdate: evalResult.forceUpdate,
          manifest: cache.manifest,
          fromCache: true,
          checkedAt: cache.checkedAt,
          error: err,
          // Cache fallback — no URL served this turn.
          manifestUrl: null,
        };
      }
      return {
        needsUpdate: false,
        forceUpdate: false,
        manifest: null,
        fromCache: false,
        checkedAt: now,
        error: err,
        manifestUrl: null,
      };
    }
  }

  /**
   * Persist "we just showed the user the dialog for this manifest".
   * Effectively resets the cache TTL — the dialog won't reappear for
   * 24h unless the user re-launches the app. Idempotent with the
   * natural cache write that `check()` already does; this is a no-op
   * for non-force flows (the next check within 24h will hit the cache
   * anyway). Provided for the "Update now" action so a future caller
   * can mark "user took the affirmative action" if we add telemetry.
   *
   * R90: ensure `checkedAt` always moves forward (≥ cache.checkedAt + 1)
   * even on the rare same-millisecond wall-clock tick, so tests
   * asserting "rewind then markSeen advances the timestamp" stay
   * deterministic. Production never hits this (the cache write in
   * `_check` already uses a fresh `now`), but the defensive bump
   * keeps the contract honest. The `now` parameter is a test seam
   * so vitest can advance time without depending on real wall-clock
   * resolution.
   */
  async markSeen(now: () => number = Date.now): Promise<void> {
    const cache = readCache();
    if (cache) {
      const freshNow = now();
      const next = Math.max(freshNow, cache.checkedAt + 1);
      writeCache({ ...cache, checkedAt: next });
    }
  }

  /**
   * Forget the cache. Next `check()` will always fetch. Used by tests
   * and by a future "Check for updates" manual affordance.
   */
  clearCache(): void {
    clearCacheStorage();
    this.inFlight = null;
  }

  /** Test/diagnostic helper. */
  readCache(): CacheState | null {
    return readCache();
  }

  /** True if running inside a Capacitor WebView (native Android). */
  isNative(): boolean {
    return isNative();
  }
}

/** Default singleton. App code should use this. */
export const updateChecker = new UpdateChecker();
