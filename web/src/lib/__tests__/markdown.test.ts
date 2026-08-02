import { describe, it, expect } from 'vitest';
import { render } from '../markdown';
import type { Note } from '../notesBacklinks';

const notes: Note[] = [
  { id: 'n1', title: 'Welcome', content: '', createdAt: 0, updatedAt: 0 },
  { id: 'n2', title: 'Roadmap', content: '', createdAt: 0, updatedAt: 0 },
];

describe('render — empty / null inputs', () => {
  it('returns empty html and empty wikilinks for empty string', () => {
    const r = render('', notes);
    expect(r.html).toBe('');
    expect(r.wikilinks).toEqual([]);
  });

  it('returns empty html for null / undefined source', () => {
    // @ts-expect-error - intentional null for runtime safety
    expect(render(null, notes).html).toBe('');
    // @ts-expect-error
    expect(render(undefined, notes).html).toBe('');
  });

  it('returns empty html when notes is missing', () => {
    // @ts-expect-error - missing notes is treated as empty
    const r = render('# Title');
    expect(r.html).toBe('<h1>Title</h1>');
    expect(r.wikilinks).toEqual([]);
  });
});

describe('render — block elements', () => {
  it('renders h1, h2, h3', () => {
    expect(render('# H1', []).html).toContain('<h1>H1</h1>');
    expect(render('## H2', []).html).toContain('<h2>H2</h2>');
    expect(render('### H3', []).html).toContain('<h3>H3</h3>');
  });

  it('does not match h4 (subset excludes it)', () => {
    // h4 falls through to a paragraph
    const r = render('#### H4', []);
    expect(r.html).not.toContain('<h4>');
    expect(r.html).toContain('<p>');
  });

  it('renders paragraph for plain text', () => {
    expect(render('hello world', []).html).toContain('<p>hello world</p>');
  });

  it('renders multiple paragraphs separated by blank lines', () => {
    const r = render('one\n\ntwo\n\nthree', []);
    expect(r.html.split('<p>').length - 1).toBe(3);
  });

  it('renders bullet list', () => {
    const r = render('- a\n- b\n- c', []);
    expect(r.html).toContain('<ul>');
    expect(r.html).toContain('<li>a</li>');
    expect(r.html).toContain('<li>b</li>');
    expect(r.html).toContain('<li>c</li>');
    expect(r.html).toContain('</ul>');
  });

  it('renders ordered list', () => {
    const r = render('1. one\n2. two', []);
    expect(r.html).toContain('<ol>');
    expect(r.html).toContain('<li>one</li>');
    expect(r.html).toContain('<li>two</li>');
    expect(r.html).toContain('</ol>');
  });

  it('renders blockquote', () => {
    const r = render('> quoted text', []);
    expect(r.html).toContain('<blockquote>quoted text</blockquote>');
  });
});

describe('render — inline elements', () => {
  it('renders bold via **', () => {
    const r = render('**bold**', []);
    expect(r.html).toContain('<strong>bold</strong>');
  });

  it('renders italic via * (single-asterisk)', () => {
    const r = render('*italic*', []);
    expect(r.html).toContain('<em>italic</em>');
  });

  it('does not double-process bold when italic runs first', () => {
    const r = render('**bold** and *italic*', []);
    expect(r.html).toContain('<strong>bold</strong>');
    expect(r.html).toContain('<em>italic</em>');
  });

  it('renders inline code', () => {
    const r = render('use `var` here', []);
    expect(r.html).toContain('<code>var</code>');
  });

  it('inline code content is not parsed for bold/italic', () => {
    const r = render('`**not bold**`', []);
    expect(r.html).toContain('<code>**not bold**</code>');
    expect(r.html).not.toContain('<strong>');
  });
});

describe('render — fenced code blocks', () => {
  it('renders fenced code block with language class', () => {
    const r = render('```js\nconst x = 1;\n```', []);
    expect(r.html).toContain('<pre><code');
    expect(r.html).toContain('language-js');
    expect(r.html).toContain('const x = 1;');
  });

  it('renders fenced code block without language', () => {
    const r = render('```\nplain\n```', []);
    expect(r.html).toContain('<pre><code>');
    expect(r.html).toContain('plain');
    expect(r.html).not.toContain('language-');
  });

  it('does not parse code block content for wikilinks / bold', () => {
    const r = render('```js\nconst r = "[[A]]";\n```', notes);
    expect(r.html).toContain('[[A]]');
    expect(r.html).not.toContain('class="wikilink"');
    expect(r.wikilinks).toEqual([]);
  });
});

describe('render — wikilinks', () => {
  it('renders existing wikilink with .wikilink class (not broken)', () => {
    const r = render('see [[Welcome]]', notes);
    expect(r.html).toContain('class="wikilink"');
    expect(r.html).not.toContain('wikilink--broken');
    expect(r.html).toContain('data-title="Welcome"');
    expect(r.html).toContain('href="#/notes/Welcome"');
  });

  it('renders missing wikilink with .wikilink--broken class', () => {
    const r = render('see [[Ghost]]', notes);
    expect(r.html).toContain('class="wikilink wikilink--broken"');
    expect(r.html).toContain('data-title="Ghost"');
  });

  it('supports [[Target|alias]] syntax', () => {
    const r = render('see [[Welcome|click here]]', notes);
    expect(r.html).toContain('data-title="Welcome"');
    expect(r.html).toContain('>click here<');
  });

  it('populates wikilinks[] with existence flag', () => {
    const r = render('[[Welcome]] and [[Ghost]]', notes);
    expect(r.wikilinks).toEqual([
      { title: 'Welcome', exists: true },
      { title: 'Ghost', exists: false },
    ]);
  });

  it('deduplicates wikilinks[] (first occurrence wins)', () => {
    const r = render('[[Welcome]] and [[Welcome]] and [[Welcome]]', notes);
    expect(r.wikilinks).toEqual([{ title: 'Welcome', exists: true }]);
  });

  it('escapes attribute injection in data-title', () => {
    const r = render('[[A" onmouseover="x]]', []);
    expect(r.html).not.toContain('onmouseover="x"');
    expect(r.html).toContain('&quot;');
  });

  it('skips empty wikilinks [[]]', () => {
    const r = render('[[]] ignored', notes);
    expect(r.html).not.toContain('class="wikilink"');
    expect(r.wikilinks).toEqual([]);
  });
});

describe('render — sanitization', () => {
  it('escapes <script> tags in source', () => {
    const r = render('<script>alert(1)</script>\nhello', []);
    expect(r.html).not.toContain('<script>');
    expect(r.html).not.toContain('</script>');
    expect(r.html).toContain('&lt;script&gt;');
    expect(r.html).toContain('hello');
  });

  it('escapes <iframe> tags in source', () => {
    const r = render('<iframe src="x"></iframe>\nbody', []);
    expect(r.html).not.toContain('<iframe');
    expect(r.html).toContain('&lt;iframe');
    expect(r.html).toContain('body');
  });

  it('escapes on*= attributes in source text (raw <a> cannot survive)', () => {
    const r = render('click <a href="x" onclick="alert(1)">here</a>', []);
    // The raw unescaped <a tag must NOT appear (that would be executable).
    // The escaped form (&lt;a ...) is fine — it renders as text.
    expect(r.html).not.toContain('<a href');
    expect(r.html).not.toMatch(/<a\s/);
    expect(r.html).toContain('&lt;');
    expect(r.html).toContain('here');
  });

  it('escapes ampersands in plain text', () => {
    const r = render('Tom & Jerry', []);
    expect(r.html).toContain('Tom &amp; Jerry');
  });
});
