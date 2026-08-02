import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import NoteToolbar from '../NoteToolbar.svelte';

// Hoisted mocks for the recognition module so the toolbar can import
// `$lib/voice/recognition` without pulling in the real window.Capacitor globals.
const { isAvailable, start, stop } = vi.hoisted(() => ({
  isAvailable: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
}));

vi.mock('$lib/voice/recognition', () => ({
  isAvailable,
  start,
  stop,
}));

describe('NoteToolbar', () => {
  afterEach(cleanup);

  beforeEach(() => {
    isAvailable.mockReset();
    start.mockReset();
    stop.mockReset();
    // default: recognition unavailable — voice button just no-ops safely
    isAvailable.mockResolvedValue(false);
    start.mockResolvedValue(undefined);
    stop.mockResolvedValue(undefined);
  });

  it('renders 8 tool buttons', () => {
    render(NoteToolbar, { props: { onAction: vi.fn() } });
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(8);
  });

  it('exposes the 8 expected actions', () => {
    render(NoteToolbar, { props: { onAction: vi.fn() } });
    for (const id of ['bold', 'italic', 'code', 'link', 'list', 'heading', 'image', 'voice']) {
      expect(screen.getByTestId(`toolbar-${id}`)).toBeInTheDocument();
    }
  });

  it('calls onAction with the right id when a button is clicked', async () => {
    const onAction = vi.fn();
    render(NoteToolbar, { props: { onAction } });
    await fireEvent.click(screen.getByTestId('toolbar-bold'));
    await fireEvent.click(screen.getByTestId('toolbar-italic'));
    await fireEvent.click(screen.getByTestId('toolbar-link'));
    expect(onAction).toHaveBeenCalledTimes(3);
    expect(onAction).toHaveBeenNthCalledWith(1, 'bold');
    expect(onAction).toHaveBeenNthCalledWith(2, 'italic');
    expect(onAction).toHaveBeenNthCalledWith(3, 'link');
  });

  it('disables all buttons when disabled=true', () => {
    render(NoteToolbar, { props: { onAction: vi.fn(), disabled: true } });
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(8);
    for (const b of buttons) {
      expect(b).toBeDisabled();
    }
  });

  it('does not call onAction when disabled', async () => {
    const onAction = vi.fn();
    render(NoteToolbar, { props: { onAction, disabled: true } });
    await fireEvent.click(screen.getByTestId('toolbar-bold'));
    expect(onAction).not.toHaveBeenCalled();
  });

  it('applies aria-disabled on the toolbar element when disabled', () => {
    render(NoteToolbar, { props: { onAction: vi.fn(), disabled: true } });
    const toolbar = screen.getByTestId('note-toolbar');
    expect(toolbar).toHaveAttribute('aria-disabled', 'true');
  });

  it('uses role=toolbar with aria-label', () => {
    render(NoteToolbar, { props: { onAction: vi.fn() } });
    const toolbar = screen.getByRole('toolbar', { name: /Markdown formatting/i });
    expect(toolbar).toBeInTheDocument();
  });

  it('exposes aria-label for each tool button', () => {
    render(NoteToolbar, { props: { onAction: vi.fn() } });
    expect(screen.getByLabelText(/Bold/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Italic/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Insert link/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Bullet list/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Heading/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Insert image/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Inline code/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Voice input/i)).toBeInTheDocument();
  });

  it('voice button has aria-pressed reflecting listening state', () => {
    render(NoteToolbar, { props: { onAction: vi.fn() } });
    const mic = screen.getByTestId('toolbar-voice');
    expect(mic.getAttribute('aria-pressed')).toBe('false');
    expect(mic.getAttribute('data-voice-state')).toBe('idle');
  });

  it('tapping the mic button calls start() from the recognition module', async () => {
    isAvailable.mockResolvedValue(true);
    const onAction = vi.fn();
    render(NoteToolbar, { props: { onAction, activeNoteId: 'n1' } });
    await fireEvent.click(screen.getByTestId('toolbar-voice'));
    // Flush the async toggleVoice: isAvailable() then start() each yield a microtask.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(isAvailable).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
    // Voice is a capture toggle, not a markdown action — onAction must NOT fire.
    expect(onAction).not.toHaveBeenCalled();
  });

  it('renders 44dp min touch targets via CSS (not testable, contract check)', () => {
    render(NoteToolbar, { props: { onAction: vi.fn() } });
    // Visual contract — class is applied for styling. We verify the toolbar element exists.
    expect(screen.getByTestId('note-toolbar')).toBeInTheDocument();
  });

  it('compact mode hides labels', () => {
    render(NoteToolbar, { props: { onAction: vi.fn(), compact: true } });
    const toolbar = screen.getByTestId('note-toolbar');
    expect(toolbar.classList.contains('md-toolbar--compact')).toBe(true);
  });
});
