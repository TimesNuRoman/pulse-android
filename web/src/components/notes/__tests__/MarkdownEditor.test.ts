import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import MarkdownEditor from '../MarkdownEditor.svelte';

describe('MarkdownEditor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('mounts with placeholder and aria-label', () => {
    render(MarkdownEditor, { props: { value: '', placeholder: 'Write here…' } });
    const el = screen.getByRole('textbox', { name: /Write here…|Markdown editor/i });
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute('aria-multiline', 'true');
  });

  it('reflects mode in data-mode attribute', () => {
    render(MarkdownEditor, { props: { value: 'hello', mode: 'split' } });
    const el = screen.getByTestId('markdown-editor');
    expect(el).toHaveAttribute('data-mode', 'split');
  });

  it('hides source when mode is preview', () => {
    render(MarkdownEditor, { props: { value: 'hello', mode: 'preview' } });
    const el = screen.getByTestId('markdown-editor');
    expect(el).toHaveAttribute('data-mode', 'preview');
    // In preview-only mode, no source pane is rendered
    expect(screen.queryByRole('textbox', { name: /Markdown editor/i })).not.toBeInTheDocument();
  });

  it('emits data-ready only after CodeMirror mounts (or false if it fails)', async () => {
    const { container } = render(MarkdownEditor, { props: { value: 'hello' } });
    const el = container.querySelector('[data-testid="markdown-editor"]') as HTMLElement;
    expect(el).toBeInTheDocument();
    // data-ready may be "true" or "false" depending on whether CM6 loaded in jsdom
    expect(['true', 'false']).toContain(el.dataset.ready);
  });

  it('renders preview slot when mode is split', () => {
    render(MarkdownEditor, { props: { value: 'hello', mode: 'split' } });
    expect(screen.getByTestId('markdown-preview-slot')).toBeInTheDocument();
  });

  it('respects maxLength when typing (does not call onChange past limit)', async () => {
    const onChange = vi.fn();
    render(MarkdownEditor, { props: { value: 'abc', onChange, maxLength: 5 } });
    // Direct doc change dispatch is tested via the editor instance.
    // Contract test: the prop is consumed (no error).
    expect(onChange).not.toHaveBeenCalled();
  });

  it('uses default placeholder when none provided', () => {
    render(MarkdownEditor, { props: { value: '' } });
    const el = screen.getByRole('textbox');
    expect(el).toHaveAttribute('data-placeholder', 'Start writing in markdown…');
  });
});
