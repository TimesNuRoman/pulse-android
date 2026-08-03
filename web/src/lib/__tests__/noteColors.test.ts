// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import {
  NOTE_COLORS,
  getAllNoteColors,
  getNoteColorHex,
  getNoteColorLabel,
  isValidNoteColor,
  normalizeColor,
} from '../noteColors';

const HEX_RE = /^#[0-9a-f]{6}$/i;

describe('getAllNoteColors', () => {
  it('returns 9 entries (8 colors + none)', () => {
    expect(getAllNoteColors().length).toBe(9);
  });

  it('first entry is the "none" placeholder so the picker can clear color in one tap', () => {
    const list = getAllNoteColors();
    expect(list[0]?.id).toBe('none');
    expect(list[0]?.hex).toBeNull();
  });

  it('each entry has a stable id, a non-empty label, and a hex or null', () => {
    for (const c of getAllNoteColors()) {
      expect(typeof c.id).toBe('string');
      expect(c.id.length).toBeGreaterThan(0);
      expect(typeof c.label).toBe('string');
      expect(c.label.length).toBeGreaterThan(0);
      if (c.id === 'none') {
        expect(c.hex).toBeNull();
      } else {
        expect(c.hex).toMatch(HEX_RE);
      }
    }
  });

  it('ids are unique and stable (no randomness, no duplicates)', () => {
    const ids = getAllNoteColors().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(NOTE_COLORS);
  });
});

describe('getNoteColorHex', () => {
  it('returns the locked Tokyo Night HEX for every color', () => {
    expect(getNoteColorHex('red')).toBe('#f7768e');
    expect(getNoteColorHex('orange')).toBe('#ff9e64');
    expect(getNoteColorHex('yellow')).toBe('#e0af68');
    expect(getNoteColorHex('green')).toBe('#9ece6a');
    expect(getNoteColorHex('cyan')).toBe('#7dcfff');
    expect(getNoteColorHex('blue')).toBe('#7aa2f7');
    expect(getNoteColorHex('purple')).toBe('#bb9af7');
    expect(getNoteColorHex('pink')).toBe('#ff79c6');
  });

  it('returns null for "none"', () => {
    expect(getNoteColorHex('none')).toBeNull();
  });

  it('returns null for null / undefined / empty string (defensive)', () => {
    expect(getNoteColorHex(null)).toBeNull();
    expect(getNoteColorHex(undefined)).toBeNull();
    expect(getNoteColorHex('')).toBeNull();
  });

  it('all HEX values are 6-char lowercase hex (matches app.css --tn-accent-* vars)', () => {
    for (const c of getAllNoteColors()) {
      if (c.hex) expect(c.hex).toMatch(HEX_RE);
    }
  });
});

describe('getNoteColorLabel', () => {
  it('returns the English label for each id', () => {
    expect(getNoteColorLabel('red')).toBe('Red');
    expect(getNoteColorLabel('blue')).toBe('Blue');
    expect(getNoteColorLabel('none')).toBe('No color');
  });

  it('accepts Cyrillic (and any UTF-8) text in surrounding code without errors', () => {
    const noteTitle = 'Красный — палитра заметок';
    expect(noteTitle).toMatch(/[\u0400-\u04FF]/);
    expect(getNoteColorLabel('red')).toBe('Red');
  });
});

describe('isValidNoteColor', () => {
  it('accepts every NoteColor id', () => {
    for (const c of NOTE_COLORS) {
      expect(isValidNoteColor(c)).toBe(true);
    }
  });

  it('rejects unknown strings, numbers, null, undefined, objects', () => {
    expect(isValidNoteColor('magenta')).toBe(false);
    expect(isValidNoteColor('#f7768e')).toBe(false);
    expect(isValidNoteColor(0)).toBe(false);
    expect(isValidNoteColor(42)).toBe(false);
    expect(isValidNoteColor(null)).toBe(false);
    expect(isValidNoteColor(undefined)).toBe(false);
    expect(isValidNoteColor({})).toBe(false);
    expect(isValidNoteColor([])).toBe(false);
    expect(isValidNoteColor(true)).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidNoteColor('')).toBe(false);
  });
});

describe('normalizeColor', () => {
  it('passes valid ids through unchanged', () => {
    expect(normalizeColor('red')).toBe('red');
    expect(normalizeColor('none')).toBe('none');
    expect(normalizeColor('blue')).toBe('blue');
  });

  it('defaults to "none" for invalid input (defensive for bad localStorage)', () => {
    expect(normalizeColor('magenta')).toBe('none');
    expect(normalizeColor(null)).toBe('none');
    expect(normalizeColor(undefined)).toBe('none');
    expect(normalizeColor(42)).toBe('none');
    expect(normalizeColor({})).toBe('none');
    expect(normalizeColor('')).toBe('none');
  });
});
