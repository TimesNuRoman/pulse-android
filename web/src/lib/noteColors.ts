// SPDX-License-Identifier: Apache-2.0
/**
 * Note color tags (R196).
 *
 * Pure, framework-agnostic module. No Svelte, no DOM, no localStorage.
 * Stores a stable color ID per note; the UI looks up the HEX from this
 * module. Keeps the wire format tiny (one enum-ish string) and lets us
 * re-skin colors in one place without migrating stored data.
 *
 * Tokyo Night palette is locked — the rest of the app (settings, toolbar,
 * theme) already uses these HEX values via CSS vars. See app.css for
 * `--tn-accent-{red,orange,yellow,green,cyan,blue,purple,pink}`.
 */

export type NoteColor =
  | 'none'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'cyan'
  | 'blue'
  | 'purple'
  | 'pink';

export const NOTE_COLORS: ReadonlyArray<NoteColor> = [
  'none',
  'red',
  'orange',
  'yellow',
  'green',
  'cyan',
  'blue',
  'purple',
  'pink',
] as const;

interface ColorEntry {
  id: NoteColor;
  hex: string | null;
  label: string;
}

/**
 * Authoritative color table. Order here is the order the picker renders.
 * `none` is intentionally first so the user can clear a color with one
 * tap (it's also reachable by tapping the current color — see UI).
 */
const COLOR_TABLE: ReadonlyArray<ColorEntry> = [
  { id: 'none', hex: null, label: 'No color' },
  { id: 'red', hex: '#f7768e', label: 'Red' },
  { id: 'orange', hex: '#ff9e64', label: 'Orange' },
  { id: 'yellow', hex: '#e0af68', label: 'Yellow' },
  { id: 'green', hex: '#9ece6a', label: 'Green' },
  { id: 'cyan', hex: '#7dcfff', label: 'Cyan' },
  { id: 'blue', hex: '#7aa2f7', label: 'Blue' },
  { id: 'purple', hex: '#bb9af7', label: 'Purple' },
  { id: 'pink', hex: '#ff79c6', label: 'Pink' },
];

const HEX_LOOKUP: ReadonlyMap<NoteColor, string | null> = new Map(
  COLOR_TABLE.map((c) => [c.id, c.hex]),
);

const LABEL_LOOKUP: ReadonlyMap<NoteColor, string> = new Map(
  COLOR_TABLE.map((c) => [c.id, c.label]),
);

/** Returns the HEX string for a given color id, or null for 'none'. */
export function getNoteColorHex(color: NoteColor | null | undefined): string | null {
  if (!color) return null;
  return HEX_LOOKUP.get(color) ?? null;
}

/** Returns the human-readable label (English). UI may localize later. */
export function getNoteColorLabel(color: NoteColor | null | undefined): string {
  if (!color) return '';
  return LABEL_LOOKUP.get(color) ?? '';
}

/** Returns the full list (9 entries: 'none' + 8 colors) for UI rendering. */
export function getAllNoteColors(): ReadonlyArray<ColorEntry> {
  return COLOR_TABLE;
}

/** Type guard. True for every NoteColor id; false for anything else. */
export function isValidNoteColor(s: unknown): s is NoteColor {
  if (typeof s !== 'string') return false;
  return HEX_LOOKUP.has(s as NoteColor);
}

/**
 * Coerce unknown input to a valid NoteColor. Invalid values fall back
 * to 'none' — this is the safe default for migrations and bad localStorage.
 */
export function normalizeColor(raw: unknown): NoteColor {
  if (isValidNoteColor(raw)) return raw;
  return 'none';
}
