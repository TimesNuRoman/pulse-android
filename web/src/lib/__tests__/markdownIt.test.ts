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
    expect(html).toContain('class="autolink"');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
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

describe('markdownIt - [^id] footnotes (R159)', () => {
  it('renders a single footnote with sup ref and section', () => {
    const html = renderMarkdown('text[^1] ok\n\n[^1]: my note');
    expect(html).toContain('<sup class="footnote-ref">');
    expect(html).toContain('<a href="#fn-1" id="fnref-1"');
    expect(html).toContain('aria-describedby="fn-1"');
    expect(html).toContain('>1</a>');
    expect(html).toContain('<section class="footnotes"');
    expect(html).toContain('<li id="fn-1"');
    expect(html).toContain('my note');
    expect(html).toContain('href="#fnref-1"');
    expect(html).toContain('class="footnote-backref"');
  });

  it('numbers multiple anonymous footnotes sequentially', () => {
    const html = renderMarkdown('text[^1] and [^2] done\n\n[^1]: one\n[^2]: two');
    // Both refs in body
    expect(html).toContain('href="#fn-1"');
    expect(html).toContain('href="#fn-2"');
    expect(html).toContain('>1</a>');
    expect(html).toContain('>2</a>');
    // Both defs in section, in definition order
    const idx1 = html.indexOf('<li id="fn-1"');
    const idx2 = html.indexOf('<li id="fn-2"');
    expect(idx1).toBeGreaterThan(0);
    expect(idx2).toBeGreaterThan(idx1);
    expect(html).toContain('>one <');
    expect(html).toContain('>two <');
  });

  it('uses the label for named footnotes', () => {
    const html = renderMarkdown('text[^barker] ok\n\n[^barker]: barker note');
    expect(html).toContain('href="#fn-barker"');
    expect(html).toContain('id="fnref-barker"');
    // Label is the id itself, not a number
    expect(html).toContain('>barker</a>');
    expect(html).toContain('<li id="fn-barker"');
    expect(html).toContain('barker note');
  });

  it('includes a backlink in each <li> with aria-label', () => {
    const html = renderMarkdown('text[^1] ok\n\n[^1]: my note');
    expect(html).toContain('class="footnote-backref"');
    expect(html).toContain('aria-label="back to text"');
    expect(html).toContain('>back</a>');
  });

  it('leaves undefined references as plain text (no broken link)', () => {
    const html = renderMarkdown('text[^99] no def');
    expect(html).toContain('[^99]');
    expect(html).not.toContain('href="#fn-99"');
    expect(html).not.toContain('<section class="footnotes"');
  });

  it('does not linkify [^id] inside inline code', () => {
    const html = renderMarkdown('`[^1]` ok\n\n[^1]: note');
    // The inline <code>[^1]</code> must stay literal
    expect(html).toContain('<code>[^1]</code>');
    expect(html).not.toContain('href="#fn-1"');
  });

  it('does not linkify [^id] inside fenced code blocks', () => {
    const html = renderMarkdown(
      '```\n[^1] in code\n```\n\ntext[^1] ok\n\n[^1]: real note'
    );
    // The fenced code block keeps [^1] literal
    expect(html).toContain('<pre><code>[^1] in code');
    // The body ref still linkifies
    expect(html).toContain('href="#fn-1"');
    expect(html).toContain('real note');
  });

  it('handles multiple references to the same footnote', () => {
    const html = renderMarkdown('text[^1] more[^1] end\n\n[^1]: shared note');
    // Two refs in body
    const refCount = (html.match(/id="fnref-1"/g) ?? []).length;
    expect(refCount).toBe(2);
    // Single <li> in section
    const liCount = (html.match(/<li id="fn-1"/g) ?? []).length;
    expect(liCount).toBe(1);
  });

  it('renders empty footnote as empty <li> with backlink', () => {
    const html = renderMarkdown('text[^1]\n\n[^1]: ');
    // Section still appears
    expect(html).toContain('<section class="footnotes"');
    // <li> exists
    expect(html).toContain('<li id="fn-1"');
    // Backlink exists
    expect(html).toContain('class="footnote-backref"');
  });

  it('ignores definitions inside fenced code blocks (no list entry for them)', () => {
    const html = renderMarkdown(
      '```\n[^1]: def-in-code\n```\n\ntext[^1]\n\n[^1]: real def'
    );
    // The "def-in-code" is in the code block (literal) - it shows up as code text.
    // But it must NOT be registered as a footnote definition. So the section has
    // exactly 1 <li> for the "real def", not 2.
    const liCount = (html.match(/<li id="fn-/g) ?? []).length;
    expect(liCount).toBe(1);
    // The "real def" appears in the list
    expect(html).toContain('real def');
  });

  it('skips unreferenced definitions (orphan defs do not appear)', () => {
    const html = renderMarkdown('just text\n\n[^1]: orphan def');
    expect(html).toContain('just text');
    expect(html).not.toContain('orphan def');
    expect(html).not.toContain('<section class="footnotes"');
  });

  it('escapes HTML in footnote definitions (XSS protection)', () => {
    const html = renderMarkdown(
      'text[^1]\n\n[^1]: <script>alert(1)</script>'
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes HTML attributes in footnote definitions (XSS protection)', () => {
    const html = renderMarkdown(
      'text[^1]\n\n[^1]: <img src=x onerror=alert(1)>'
    );
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('escapes special characters in the footnote id used in href', () => {
    // IDs with hyphens are valid and must be preserved
    const html = renderMarkdown('text[^my-note] ok\n\n[^my-note]: note');
    expect(html).toContain('href="#fn-my-note"');
    expect(html).toContain('id="fnref-my-note"');
  });

  it('renders the section at the bottom of the document', () => {
    const html = renderMarkdown('text[^1]\n\n[^1]: note');
    // Body content appears before the section
    const pIdx = html.indexOf('text<sup');
    const sectionIdx = html.indexOf('<section class="footnotes"');
    expect(pIdx).toBeGreaterThanOrEqual(0);
    expect(sectionIdx).toBeGreaterThan(pIdx);
  });

  it('hides definition lines from the body (no visible "[^1]: text" paragraph)', () => {
    const html = renderMarkdown('text[^1] ok\n\n[^1]: my note');
    // The def line itself must not appear as a body paragraph
    expect(html).not.toContain('<p>[^1]: my note</p>');
    expect(html).not.toContain('<p>[^1]:</p>');
  });
});

describe('markdownIt — autolink pass (R158)', () => {
  it('autolinks a bare https URL and adds target/rel', () => {
    const html = renderMarkdown('check https://example.com today');
    expect(html).toContain('class="autolink"');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('autolinks a URL with path', () => {
    const html = renderMarkdown('see https://example.com/path/to/page');
    expect(html).toContain('class="autolink"');
    expect(html).toContain('href="https://example.com/path/to/page"');
  });

  it('autolinks a URL with query string (ampersand escaped)', () => {
    const html = renderMarkdown('hit https://example.com?q=hello&x=1 now');
    expect(html).toContain('class="autolink"');
    expect(html).toContain('href="https://example.com?q=hello&amp;x=1"');
  });

  it('autolinks www. URLs with http:// prefix', () => {
    const html = renderMarkdown('visit www.example.com soon');
    expect(html).toContain('class="autolink"');
    expect(html).toContain('href="http://www.example.com"');
  });

  it('handles GitHub-flavored <URL> syntax', () => {
    const html = renderMarkdown('open <https://example.com/docs> now');
    expect(html).toContain('class="autolink"');
    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain('>https://example.com/docs<');
  });

  it('autolinks email addresses with mailto:', () => {
    const html = renderMarkdown('contact: hello@example.com');
    expect(html).toContain('class="autolink"');
    expect(html).toContain('href="mailto:hello@example.com"');
    expect(html).toContain('>hello@example.com<');
  });

  it('does not double-wrap an existing markdown link', () => {
    const html = renderMarkdown('see [docs](https://example.com) now');
    // The href is linkified only once, body is the original "docs" text.
    const anchorCount = (html.match(/<a[^>]*href="https:\/\/example\.com"/g) ?? []).length;
    expect(anchorCount).toBe(1);
    expect(html).toContain('class="autolink"');
    expect(html).toContain('>docs<');
  });

  it('does not linkify URLs inside inline code', () => {
    const html = renderMarkdown('here is `https://example.com` literal');
    expect(html).toContain('<code>https://example.com</code>');
    expect(html).not.toContain('class="autolink"');
  });

  it('rejects unsafe URL schemes (javascript:) and renders as plain text', () => {
    const html = renderMarkdown('do not click javascript:alert(1) here');
    expect(html).not.toContain('class="autolink"');
    expect(html).not.toContain('<a href="javascript:');
    // The visible text is still there, just not wrapped in an anchor.
    expect(html).toContain('javascript:alert(1)');
  });

  it('rejects unsafe scheme passed via markdown link syntax', () => {
    const html = renderMarkdown('[click](javascript:alert(1))');
    expect(html).not.toContain('<a ');
    expect(html).toContain('click');
  });

  it('leaves wikilink anchors alone (does not overwrite their class)', () => {
    const html = renderMarkdown('see [[Project Alpha]] for details');
    expect(html).toContain('class="wikilink"');
    expect(html).toContain('data-target="Project Alpha"');
    expect(html).not.toContain('class="autolink"');
    expect(html).not.toContain('target="_blank"');
  });

  it('leaves tag anchors alone (does not overwrite their class)', () => {
    const html = renderMarkdown('thinking #rust and #wasm');
    expect(html).toContain('class="tag"');
    expect(html).toContain('data-tag="rust"');
    expect(html).not.toContain('class="autolink"');
  });

  it('handles bare URL adjacent to wikilink (mixed links)', () => {
    const html = renderMarkdown('[[A]] and https://b.com and #tag');
    expect(html).toContain('class="wikilink"');
    expect(html).toContain('class="autolink"');
    expect(html).toContain('href="https://b.com"');
    expect(html).toContain('class="tag"');
  });

  it('does not add target/rel to scheme-relative or fragment links', () => {
    // markdown-it linkify will not autolink a bare fragment; the post-pass
    // should still not crash on edge inputs.
    const html = renderMarkdown('text with #fragment-like-thing');
    // # is treated as a tag (or text); no autolink class should appear.
    expect(html).not.toContain('class="autolink"');
  });
});
