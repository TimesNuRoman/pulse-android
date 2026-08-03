// SPDX-License-Identifier: Apache-2.0
/**
 * Settings registry (R178).
 *
 * Static list of every addressable setting on the Settings screen. The
 * search overlay (`SettingsSearch.svelte`) reads this list, scores each
 * entry against the query, and dispatches the chosen entry to the
 * caller via `onSelect`.
 *
 * Two output shapes are supported per entry:
 *   - `scrollTarget` — a CSS selector. The caller scrolls the matching
 *     DOM element into view (settings sections get `id` attributes that
 *     match these strings).
 *   - `link` — an absolute URL. The caller opens it in a new tab.
 *
 * If both are absent the caller should treat the entry as a no-op (kept
 * for future-proofing — a future `action` callback can be added here
 * without changing the registry shape).
 *
 * Anonymous brand: titles and keywords are generic. No "Pulse" or
 * product name in user-facing text.
 */
export type SettingCategory =
  | 'profile'
  | 'theme'
  | 'feedback'
  | 'about'
  | 'actions';

export interface SettingEntry {
  /** Stable id, e.g. `"profile.display-name"`. Used as the key in callbacks. */
  id: string;
  /** Section this entry belongs to. */
  category: SettingCategory;
  /** User-facing title. */
  title: string;
  /** Lowercase keywords for fuzzy matching. */
  keywords: string[];
  /** CSS selector to scroll into view when this entry is selected. */
  scrollTarget?: string;
  /** Absolute URL to open in a new tab when this entry is selected. */
  link?: string;
}

/**
 * All searchable settings. Order matters: the search overlay renders
 * results in registry order when scores tie, so put the most likely
 * "first hit" for each section at the top.
 */
export const SETTINGS_REGISTRY: readonly SettingEntry[] = Object.freeze([
  // ── Profile ───────────────────────────────────────────────────────
  {
    id: 'profile.display-name',
    category: 'profile',
    title: 'Display name',
    keywords: ['profile', 'name', 'user', 'identity', 'nickname'],
    scrollTarget: '#settings-section-profile',
  },

  // ── Theme ─────────────────────────────────────────────────────────
  {
    id: 'theme.palette',
    category: 'theme',
    title: 'Theme',
    keywords: ['color', 'dark', 'tokyo', 'palette', 'swatch', 'night'],
    scrollTarget: '#settings-section-theme',
  },

  // ── Feedback (haptics) ────────────────────────────────────────────
  {
    id: 'feedback.haptics-toggle',
    category: 'feedback',
    title: 'Haptics',
    keywords: ['feedback', 'vibration', 'tactile', 'tap', 'haptic', 'buzz'],
    scrollTarget: '#settings-section-feedback',
  },

  // ── About ─────────────────────────────────────────────────────────
  {
    id: 'about.version',
    category: 'about',
    title: 'Version',
    keywords: ['version', 'release', 'build', 'app', 'number'],
    scrollTarget: '#settings-section-about',
  },
  {
    id: 'about.manifest-host',
    category: 'about',
    title: 'Update host',
    keywords: ['manifest', 'update', 'host', 'download', 'cdn', 'url'],
    scrollTarget: '#settings-section-about',
  },
  {
    id: 'about.sha256',
    category: 'about',
    title: 'SHA-256',
    keywords: ['sha', 'hash', 'checksum', 'integrity', 'verify'],
    scrollTarget: '#settings-section-about',
  },
  {
    id: 'about.last-check',
    category: 'about',
    title: 'Last update check',
    keywords: ['check', 'update', 'time', 'last', 'when'],
    scrollTarget: '#settings-section-about',
  },
  {
    id: 'about.license',
    category: 'about',
    title: 'License',
    keywords: ['apache', 'license', 'legal', 'open', 'source'],
    link: 'https://www.apache.org/licenses/LICENSE-2.0',
  },

  // ── Actions ───────────────────────────────────────────────────────
  {
    id: 'actions.replay-onboarding',
    category: 'actions',
    title: 'Replay onboarding',
    keywords: ['onboarding', 'tutorial', 'intro', 'replay', 'walkthrough'],
    scrollTarget: '#settings-section-actions',
  },
  {
    id: 'actions.reset-mocks',
    category: 'actions',
    title: 'Reset to mock data',
    keywords: ['reset', 'mock', 'data', 'clear', 'factory', 'default'],
    scrollTarget: '#settings-section-actions',
  },
  {
    id: 'actions.github-source',
    category: 'actions',
    title: 'Source on GitHub',
    keywords: ['github', 'source', 'code', 'repo', 'repository'],
    link: 'https://github.com/TimesNuRoman/pulse',
  },
  {
    id: 'actions.release-notes',
    category: 'actions',
    title: 'Release notes',
    keywords: ['release', 'changelog', 'history', 'notes', 'version', 'updates'],
    link: 'https://github.com/TimesNuRoman/pulse/releases',
  },
]);
