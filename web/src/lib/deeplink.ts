// SPDX-License-Identifier: Apache-2.0
/**
 * Deep link parser.
 *
 * R173 — supports `pulse://note/{id}` so the home screen widget can open
 * the app at a specific note. The Android widget fires
 *   Intent { action = VIEW, data = "pulse://note/<id>" }
 * and the Capacitor app receives the URL via the App plugin (or directly
 * via window.handleOpenUrl). This parser normalizes whatever input we get
 * into a { type, id } | null shape that the router can dispatch on.
 *
 * Future variants (e.g. `pulse://settings`, `pulse://tag/foo`) slot in by
 * adding more branches to parseDeeplink.
 */

export type Deeplink =
  | { type: 'note'; id: string }
  | { type: 'unknown'; raw: string };

const PULSE_SCHEME = /^pulse:\/\/(.*)$/i;
const NOTE_PATH = /^\/note\/([A-Za-z0-9_-]+)\/?$/;

export function parseDeeplink(input: string | null | undefined): Deeplink | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  let path: string;
  const pulseMatch = trimmed.match(PULSE_SCHEME);
  if (pulseMatch) {
    // Custom scheme: everything after `pulse://` is the path. The WHATWG URL
    // parser would treat the first segment as a host, which is wrong for
    // a non-hierarchical scheme like ours.
    const rest = pulseMatch[1].trim();
    if (!rest) return null;
    path = rest.startsWith('/') ? rest : '/' + rest;
  } else if (trimmed.startsWith('/')) {
    path = trimmed;
  } else if (trimmed.includes('://')) {
    try {
      const url = new URL(trimmed);
      path = url.pathname;
    } catch {
      return null;
    }
  } else {
    return null;
  }

  const noteMatch = path.match(NOTE_PATH);
  if (noteMatch) {
    return { type: 'note', id: noteMatch[1] };
  }
  return { type: 'unknown', raw: trimmed };
}
