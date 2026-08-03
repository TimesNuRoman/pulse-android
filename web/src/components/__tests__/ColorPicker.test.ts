// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import NotesView from '../../views/NotesView.svelte';
import { notesStore } from '$lib/notesStore';
import { getNoteColorHex } from '$lib/noteColors';

describe('NotesView color picker (R196)', () => {
  beforeEach(() => {
    localStorage.clear();
    notesStore.resetToMocks();
  });
  afterEach(cleanup);

  it('renders the 9-dot color picker with the right testids on the open-note screen', async () => {
    render(NotesView);
    await fireEvent.click(screen.getByTestId('note-card-n1'));
    const picker = screen.getByTestId('color-picker');
    expect(picker).toBeInTheDocument();
    expect(picker.getAttribute('role')).toBe('radiogroup');
    expect(picker.getAttribute('aria-label')).toBe('Note color');
    const ids = ['none', 'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'];
    for (const id of ids) {
      expect(screen.getByTestId(`color-${id}`)).toBeInTheDocument();
    }
  });

  it('clicking a color dot calls notesStore.setColor and updates the store', async () => {
    render(NotesView);
    await fireEvent.click(screen.getByTestId('note-card-n1'));
    await fireEvent.click(screen.getByTestId('color-red'));
    const after = notesStore.get('n1');
    expect(after?.color).toBe('red');
  });

  it('clicking the same dot twice toggles back to "none" (clears the color)', async () => {
    render(NotesView);
    await fireEvent.click(screen.getByTestId('note-card-n1'));
    await fireEvent.click(screen.getByTestId('color-blue'));
    expect(notesStore.get('n1')?.color).toBe('blue');
    await fireEvent.click(screen.getByTestId('color-blue'));
    expect(notesStore.get('n1')?.color).toBeNull();
  });

  it('the selected color dot has aria-checked="true"; others have aria-checked="false"', async () => {
    render(NotesView);
    await fireEvent.click(screen.getByTestId('note-card-n1'));
    const noneDot = screen.getByTestId('color-none');
    const redDot = screen.getByTestId('color-red');
    expect(noneDot.getAttribute('aria-checked')).toBe('true');
    expect(redDot.getAttribute('aria-checked')).toBe('false');
    await fireEvent.click(redDot);
    expect(redDot.getAttribute('aria-checked')).toBe('true');
    expect(noneDot.getAttribute('aria-checked')).toBe('false');
  });

  it('every dot has a non-empty aria-label (a11y)', async () => {
    render(NotesView);
    await fireEvent.click(screen.getByTestId('note-card-n1'));
    const ids = ['none', 'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'];
    for (const id of ids) {
      const dot = screen.getByTestId(`color-${id}`);
      const label = dot.getAttribute('aria-label');
      expect(label, `dot ${id} must have aria-label`).toBeTruthy();
      expect(label!.length).toBeGreaterThan(0);
    }
  });

  it('color dot button has the dedicated CSS class (touch target + dot size declared in source)', async () => {
    render(NotesView);
    await fireEvent.click(screen.getByTestId('note-card-n1'));
    const dot = screen.getByTestId('color-red');
    expect(dot.className).toContain('notes-view__color-dot');
  });

  it('notes list card exposes the color via data-color attribute for the left-border accent', async () => {
    render(NotesView);
    notesStore.setColor('n2', 'red');
    await tick();
    const card = screen.getByTestId('note-card-n2');
    expect(card.getAttribute('data-color')).toBe('red');
    const untagged = screen.getByTestId('note-card-n1');
    expect(untagged.getAttribute('data-color')).toBe('none');
  });

  it('the inline style sets a valid Tokyo Night HEX for colored notes', async () => {
    render(NotesView);
    notesStore.setColor('n3', 'blue');
    await tick();
    const card = screen.getByTestId('note-card-n3');
    const style = card.getAttribute('style') ?? '';
    // DOM normalizes HEX to rgb(); accept either form.
    const hex = getNoteColorHex('blue')!; // #7aa2f7
    const r = 0x7a, g = 0xa2, b = 0xf7;
    const rgb = `rgb(${r}, ${g}, ${b})`;
    const matches = style.includes(hex) || style.includes(rgb);
    expect(matches, `style=${style} should contain ${hex} or ${rgb}`).toBe(true);
  });
});
