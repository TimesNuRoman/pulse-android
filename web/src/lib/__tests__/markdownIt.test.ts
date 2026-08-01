import { describe, it, expect } from 'vitest';
import { getMarkdownIt, renderMarkdown, analyzeNote } from '../markdownIt';

describe('markdownIt — renderMarkdown', () => {
  it('renders basic paragraphs', () => {
    const html = renderMarkdown('Hello world');
    expect(html).toContain('<p>Hello world</p>');
  });

  it('renders headings', () => {
    expect(renderMarkdown('# H1')).toContain('<h1>H1</h1>');
    expect(renderMarkdown('## H2')).toContain('<h2>H2</h2>');
    expect(renderMarkdown('### H3')).toContain('<h3>H3</h3>');
  });

  it('renders bold and italic', () => {
    expect(renderMarkdown('**bold**')).toContain('<strong>bold</strong>');
    expect(renderMarkdown('*italic*')).toContain('<em>italic</em>');
  });

  it('renders unordered lists', () => {
    const html = renderMarkdown('- a\n- b\n- c');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>a</li>');
    expect(html).toContain('<li>c</li>');
  });

  it('renders ordered lists', () => {
    const html = renderMarkdown('1. one\n2. two');
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>one</li>');
  });

  it('strips raw script tags (html: false)', () => {
    const html = renderMarkdown('<script>alert(1)</script>\nhello');
    // Raw <script> tag must NOT be present in any form that the browser
    // could execute. markdown-it with html:false escapes the angle brackets.
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('</script>');
    // The content is still readable as escaped text (safe).
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('hello');
  });

  it('strips raw iframe', () => {
    const html = renderMarkdown('<iframe src="x"></iframe>\nbody');
    expect(html).not.toContain('<iframe');
    expect(html).toContain('&lt;iframe');
    expect(html).toContain('body');
  });

  it('linkifies URLs', () => {
    const html = renderMarkdown('check https://example.com today');
    expect(html).toContain('<a href="https://example.com"');
  });

  it('escapes HTML entities in normal text', () => {
    const html = renderMarkdown('use <bold> as text');
    expect(html).toContain('&lt;bold&gt;');
    expect(html).not.toContain('<bold>');
  });

  it('does not auto-convert single newlines to <br> (breaks: false)', () => {
    const html = renderMarkdown('line one\nline two');
    expect(html).not.toContain('<br>');
  });

  it('handles empty string', () => {
    const html = renderMarkdown('');
    expect(html).toBe('');
  });

  it('handles null/undefined-ish gracefully', () => {
    // @ts-expect-error - testing runtime safety
    expect(renderMarkdown(null)).toBe('');
    // @ts-expect-error
    expect(renderMarkdown(undefined)).toBe('');
  });
});

describe('markdownIt — [[wikilink]] plugin', () => {
  it('converts [[Target]] to a wikilink anchor', () => {
    const html = renderMarkdown('see [[Project Alpha]] for details');
    expect(html).toContain('class="wikilink"');
    expect(html).toContain('data-target="Project Alpha"');
    expect(html).toContain('>Project Alpha<');
  });

  it('supports [[Target|alias]] syntax', () => {
    const html = renderMarkdown('see [[Project Alpha|click here]] now');
    expect(html).toContain('data-target="Project Alpha"');
    expect(html).toContain('>click here<');
  });

  it('escapes alias HTML to prevent XSS', () => {
    const html = renderMarkdown('[[safe|<img src=x onerror=alert(1)>]]');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });

  it('escapes data-target to prevent attribute injection', () => {
    const html = renderMarkdown('[[A" onmouseover="alert(1)]]');
    expect(html).not.toContain('onmouseover="alert(1)');
    expect(html).toContain('&quot;');
  });

  it('skips empty wikilinks', () => {
    const html = renderMarkdown('[[]] ignored');
    expect(html).not.toContain('wikilink');
  });

  it('skips multiline wikilinks', () => {
    const html = renderMarkdown('[[first\nsecond]] ignored');
    expect(html).not.toContain('wikilink');
  });

  it('does not match single-bracket [text]', () => {
    const html = renderMarkdown('a [link] b');
    expect(html).not.toContain('wikilink');
  });

  it('renders multiple wikilinks in one line', () => {
    const html = renderMarkdown('[[A]] and [[B]] and [[C]]');
    const matches = html.match(/class="wikilink"/g) ?? [];
    expect(matches.length).toBe(3);
  });
});

describe('markdownIt — #tag plugin', () => {
  it('converts #tag to a tag anchor', () => {
    const html = renderMarkdown('thinking about #rust and #wasm');
    expect(html).toContain('class="tag"');
    expect(html).toContain('data-tag="rust"');
    expect(html).toContain('data-tag="wasm"');
  });

  it('only matches tags at word boundary', () => {
    // CSS color #ff00aa (preceded by colon+space) should NOT be a tag.
    const html = renderMarkdown('color: #ff00aa today');
    expect(html).not.toContain('class="tag"');
  });

  it('matches #tag at start of line', () => {
    const html = renderMarkdown('#morning standup notes');
    expect(html).toContain('data-tag="morning"');
  });

  it('skips lone #', () => {
    const html = renderMarkdown('just a # here');
    expect(html).not.toContain('class="tag"');
  });

  it('supports hyphens and underscores in tags', () => {
    const html = renderMarkdown('#smart-engine #ai_native');
    expect(html).toContain('data-tag="smart-engine"');
    expect(html).toContain('data-tag="ai_native"');
  });

  it('escapes tag content (defensive — should never be unsafe)', () => {
    const html = renderMarkdown('#<script>');
    expect(html).not.toContain('<script>');
  });
});

describe('markdownIt — code blocks', () => {
  it('renders fenced code blocks with language class', () => {
    const html = renderMarkdown('```js\nconst x = 1;\n```');
    expect(html).toContain('language-js');
    expect(html).toContain('const');
  });

  it('renders fenced code without language', () => {
    const html = renderMarkdown('```\nplain text\n```');
    expect(html).toContain('<pre><code>');
    expect(html).toContain('plain text');
  });

  it('escapes HTML inside code blocks', () => {
    const html = renderMarkdown('```\n<script>alert(1)</script>\n```');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('highlights typescript', () => {
    const html = renderMarkdown('```ts\nconst x: number = 1;\n```');
    expect(html).toContain('language-ts');
  });

  it('highlight.js inside code block does not include wikilink tokens', () => {
    const html = renderMarkdown('```js\nconst r = "[[A]]";\n```');
    // Inside code fence, [[A]] should be literal, not a wikilink
    expect(html).not.toContain('data-target="A"');
    expect(html).toContain('[[A]]');
  });
});

describe('analyzeNote', () => {
  it('counts words and chars', () => {
    const a = analyzeNote('hello world foo');
    expect(a.wordCount).toBe(3);
    expect(a.charCount).toBe(15);
  });

  it('extracts backlinks and tags', () => {
    const a = analyzeNote('see [[Alpha]] about #rust and #wasm');
    expect(a.backlinks).toEqual(['Alpha']);
    expect(a.tags).toEqual(['rust', 'wasm']);
  });

  it('handles empty', () => {
    const a = analyzeNote('');
    expect(a.backlinks).toEqual([]);
    expect(a.tags).toEqual([]);
    expect(a.wordCount).toBe(0);
  });
});

describe('getMarkdownIt — caching', () => {
  it('returns the same instance on repeated calls', () => {
    const a = getMarkdownIt();
    const b = getMarkdownIt();
    expect(a).toBe(b);
  });
});
