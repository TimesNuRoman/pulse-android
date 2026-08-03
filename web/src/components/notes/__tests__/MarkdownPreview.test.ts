import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import MarkdownPreview from '../MarkdownPreview.svelte';
import type { Note } from '../../../lib/notesBacklinks';

const notes: Note[] = [
  { id: 'n1', title: 'Welcome', content: '', createdAt: 0, updatedAt: 0 },
  { id: 'n2', title: 'Roadmap', content: '', createdAt: 0, updatedAt: 0 },
];

describe('MarkdownPreview', () => {
  afterEach(cleanup);

  it('renders markdown to HTML', () => {
    render(MarkdownPreview, { props: { source: '# Hello world', notes } });
    const el = screen.getByTestId('markdown-preview');
    expect(el.innerHTML).toContain('<h1>Hello world</h1>');
  });

  it('renders wikilink with .wikilink class and data-title', () => {
    render(MarkdownPreview, { props: { source: 'see [[Welcome]]', notes } });
    const el = screen.getByTestId('markdown-preview');
    expect(el.innerHTML).toContain('class="wikilink"');
    expect(el.innerHTML).toContain('data-title="Welcome"');
    // Existing target must NOT be marked broken.
    expect(el.innerHTML).not.toContain('wikilink--broken');
  });

  it('renders missing-target wikilink with .wikilink--broken class', () => {
    render(MarkdownPreview, { props: { source: 'see [[Ghost Note]]', notes } });
    const el = screen.getByTestId('markdown-preview');
    expect(el.innerHTML).toContain('class="wikilink wikilink--broken"');
    expect(el.innerHTML).toContain('data-title="Ghost Note"');
  });

  it('renders fenced code blocks with language class', () => {
    render(MarkdownPreview, { props: { source: '```js\nconst x = 1;\n```', notes } });
    const el = screen.getByTestId('markdown-preview');
    expect(el.innerHTML).toContain('language-js');
  });

  it('strips raw <script> tags (sanitization)', () => {
    render(MarkdownPreview, { props: { source: '<script>alert(1)</script>\nhello', notes } });
    const el = screen.getByTestId('markdown-preview');
    expect(el.innerHTML).not.toContain('<script>');
    expect(el.innerHTML).toContain('hello');
  });

  it('escapes HTML in normal text', () => {
    render(MarkdownPreview, { props: { source: 'use <b>bold</b> as text', notes } });
    const el = screen.getByTestId('markdown-preview');
    expect(el.innerHTML).toContain('&lt;b&gt;');
    expect(el.innerHTML).not.toContain('<b>bold</b>');
  });

  it('handles empty source', () => {
    render(MarkdownPreview, { props: { source: '', notes } });
    const el = screen.getByTestId('markdown-preview');
    expect(el).toBeInTheDocument();
    expect(el.innerHTML).toBe('');
  });

  it('exposes role=article and aria-live=polite', () => {
    render(MarkdownPreview, { props: { source: 'hello', notes } });
    const el = screen.getByTestId('markdown-preview');
    expect(el).toHaveAttribute('role', 'article');
    expect(el).toHaveAttribute('aria-live', 'polite');
  });

  it('renders multiple paragraphs', () => {
    render(MarkdownPreview, { props: { source: 'one\n\ntwo\n\nthree', notes } });
    const el = screen.getByTestId('markdown-preview');
    expect(el.querySelectorAll('p').length).toBe(3);
  });

  it('renders blockquote', () => {
    render(MarkdownPreview, { props: { source: '> quoted text', notes } });
    const el = screen.getByTestId('markdown-preview');
    expect(el.innerHTML).toContain('<blockquote>');
  });
});

describe('MarkdownPreview — wikilink click delegation (R136)', () => {
  afterEach(cleanup);

  it('invokes onWikilinkClick with (target, true) for existing wikilinks', async () => {
    const onWikilinkClick = vi.fn();
    render(MarkdownPreview, {
      props: { source: 'see [[Welcome]]', notes, onWikilinkClick },
    });
    const link = document.querySelector('a.wikilink') as HTMLAnchorElement;
    expect(link).toBeTruthy();
    await fireEvent.click(link);
    expect(onWikilinkClick).toHaveBeenCalledWith('Welcome', true);
  });

  it('invokes onWikilinkClick with (target, false) for missing wikilinks', async () => {
    const onWikilinkClick = vi.fn();
    render(MarkdownPreview, {
      props: { source: 'see [[Ghost]]', notes, onWikilinkClick },
    });
    const link = document.querySelector('a.wikilink') as HTMLAnchorElement;
    expect(link).toBeTruthy();
    await fireEvent.click(link);
    expect(onWikilinkClick).toHaveBeenCalledWith('Ghost', false);
  });

  it('does not invoke onWikilinkClick when no notes map is wired (callback is undefined)', async () => {
    // No onWikilinkClick prop — the click handler should silently no-op
    // (no throw, no broken state).
    render(MarkdownPreview, { props: { source: 'see [[Welcome]]', notes } });
    const link = document.querySelector('a.wikilink') as HTMLAnchorElement;
    expect(link).toBeTruthy();
    // The action's `?.` chain must guard against the missing callback.
    await expect(fireEvent.click(link)).resolves.not.toThrow();
  });

  it('Enter key on a focused wikilink also triggers the callback', async () => {
    const onWikilinkClick = vi.fn();
    render(MarkdownPreview, {
      props: { source: 'see [[Welcome]]', notes, onWikilinkClick },
    });
    const link = document.querySelector('a.wikilink') as HTMLAnchorElement;
    expect(link).toBeTruthy();
    link.focus();
    await fireEvent.keyDown(link, { key: 'Enter' });
    expect(onWikilinkClick).toHaveBeenCalledWith('Welcome', true);
  });
});
