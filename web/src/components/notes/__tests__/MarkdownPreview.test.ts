import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import MarkdownPreview from '../MarkdownPreview.svelte';

describe('MarkdownPreview', () => {
  afterEach(cleanup);

  it('renders markdown to HTML', () => {
    render(MarkdownPreview, { props: { source: '# Hello world' } });
    const el = screen.getByTestId('markdown-preview');
    expect(el.innerHTML).toContain('<h1>Hello world</h1>');
  });

  it('renders wikilink with .wikilink class', () => {
    render(MarkdownPreview, { props: { source: 'see [[Project Alpha]]' } });
    const el = screen.getByTestId('markdown-preview');
    expect(el.innerHTML).toContain('class="wikilink"');
    expect(el.innerHTML).toContain('data-target="Project Alpha"');
  });

  it('renders #tag with .tag class', () => {
    render(MarkdownPreview, { props: { source: 'thinking #rust' } });
    const el = screen.getByTestId('markdown-preview');
    expect(el.innerHTML).toContain('class="tag"');
    expect(el.innerHTML).toContain('data-tag="rust"');
  });

  it('renders fenced code blocks with language class', () => {
    render(MarkdownPreview, { props: { source: '```js\nconst x = 1;\n```' } });
    const el = screen.getByTestId('markdown-preview');
    expect(el.innerHTML).toContain('language-js');
  });

  it('strips raw <script> tags (sanitization)', () => {
    render(MarkdownPreview, { props: { source: '<script>alert(1)</script>\nhello' } });
    const el = screen.getByTestId('markdown-preview');
    expect(el.innerHTML).not.toContain('<script>');
    expect(el.innerHTML).toContain('hello');
  });

  it('escapes HTML in normal text', () => {
    render(MarkdownPreview, { props: { source: 'use <b>bold</b> as text' } });
    const el = screen.getByTestId('markdown-preview');
    expect(el.innerHTML).toContain('&lt;b&gt;');
    expect(el.innerHTML).not.toContain('<b>bold</b>');
  });

  it('handles empty source', () => {
    render(MarkdownPreview, { props: { source: '' } });
    const el = screen.getByTestId('markdown-preview');
    expect(el).toBeInTheDocument();
    expect(el.innerHTML).toBe('');
  });

  it('exposes role=article and aria-live=polite', () => {
    render(MarkdownPreview, { props: { source: 'hello' } });
    const el = screen.getByTestId('markdown-preview');
    expect(el).toHaveAttribute('role', 'article');
    expect(el).toHaveAttribute('aria-live', 'polite');
  });

  it('renders multiple paragraphs', () => {
    render(MarkdownPreview, { props: { source: 'one\n\ntwo\n\nthree' } });
    const el = screen.getByTestId('markdown-preview');
    expect(el.querySelectorAll('p').length).toBe(3);
  });

  it('renders blockquote', () => {
    render(MarkdownPreview, { props: { source: '> quoted text' } });
    const el = screen.getByTestId('markdown-preview');
    expect(el.innerHTML).toContain('<blockquote>');
  });
});
