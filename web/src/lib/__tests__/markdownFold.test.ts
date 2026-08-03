// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { applyCodeBlockFold } from '../markdownFold';

// Helpers — small factories that build realistic <pre><code> HTML the way
// markdown-it + highlight.js actually emit it. We deliberately use the
// same shape the production pipeline produces so the tests mirror what
// `renderMarkdown()` will hand to `applyCodeBlockFold`.

const FENCE = (lang: string, body: string): string => {
  // Highlighted output includes <span class="hljs-..."> wrappers, but
  // for line-counting purposes the <pre><code class="hljs language-XYZ">
  // wrapper is what matters. We pass plain text here; the line count
  // is taken from textContent, which jsdom reconstructs from whatever
  // the markup is — spans don't add newlines.
  return `<pre><code class="hljs language-${lang}">${body}</code></pre>`;
};

const PLAIN = (body: string): string => `<pre><code>${body}</code></pre>`;

const NL = (n: number): string => Array.from({ length: n }, () => 'const x = 1;').join('\n');

describe('applyCodeBlockFold — threshold & line counting', () => {
  it('does NOT fold a 1-line code block', () => {
    const html = FENCE('js', 'const x = 1;');
    const out = applyCodeBlockFold(html);
    expect(out).toBe(html);
    expect(out).not.toContain('<details');
  });

  it('does NOT fold at the boundary (5 lines, threshold = 5)', () => {
    const html = FENCE('js', NL(5));
    const out = applyCodeBlockFold(html);
    expect(out).toBe(html);
    expect(out).not.toContain('<details');
  });

  it('folds a 6-line code block (just over threshold)', () => {
    const html = FENCE('js', NL(6));
    const out = applyCodeBlockFold(html);
    expect(out).toContain('<details class="fold">');
    expect(out).toContain('<summary class="fold__summary"');
    expect(out).toContain('Show code');
    expect(out).toContain('aria-label="Show code"');
  });

  it('folds a 50-line code block', () => {
    const html = FENCE('ts', NL(50));
    const out = applyCodeBlockFold(html);
    expect(out).toContain('<details class="fold">');
    expect(out).toContain('<summary');
  });

  it('does NOT fold a block with only a trailing newline (counts as 1 line)', () => {
    const html = FENCE('js', 'const x = 1;\n');
    const out = applyCodeBlockFold(html);
    expect(out).toBe(html);
    expect(out).not.toContain('<details');
  });

  it('does NOT fold an empty <pre><code></code></pre> (0 lines)', () => {
    const html = '<pre><code class="hljs language-js"></code></pre>';
    const out = applyCodeBlockFold(html);
    expect(out).toBe(html);
    expect(out).not.toContain('<details');
  });
});

describe('applyCodeBlockFold — language filter', () => {
  it('does NOT fold a <pre> with no language class (plain unstyled)', () => {
    // 6 lines so threshold would otherwise be met, but no language class.
    const html = PLAIN(NL(6));
    const out = applyCodeBlockFold(html);
    expect(out).toBe(html);
    expect(out).not.toContain('<details');
  });

  it('folds blocks in different languages (js, ts, rust, python, bash)', () => {
    for (const lang of ['js', 'ts', 'rust', 'py', 'bash', 'json', 'css']) {
      const html = FENCE(lang, NL(10));
      const out = applyCodeBlockFold(html);
      expect(out, `lang=${lang}`).toContain('<details class="fold">');
    }
  });

  it('does NOT fold a <pre> with class but no language-* token', () => {
    const html = '<pre><code class="hljs">' + NL(10) + '</code></pre>';
    const out = applyCodeBlockFold(html);
    expect(out).toBe(html);
    expect(out).not.toContain('<details');
  });
});

describe('applyCodeBlockFold — content preservation', () => {
  it('preserves HTML special chars inside the code block (no double-escape)', () => {
    // Simulate highlight.js output: a <div> in the source is escaped to
    // &lt;div&gt; and that escaping must round-trip cleanly through the
    // fold wrapper without being re-escaped. 6 lines so the threshold is met.
    const body = [
      '&lt;div class="x"&gt;',
      '  &amp;nbsp;',
      '  &lt;span&gt;hi&lt;/span&gt;',
      '  &lt;a href="x"&gt;link&lt;/a&gt;',
      '  &lt;img src="y" /&gt;',
      '&lt;/div&gt;',
    ].join('\n');
    const html = FENCE('html', body);
    const out = applyCodeBlockFold(html);
    expect(out).toContain('<details class="fold">');
    // The escaped content is kept verbatim.
    expect(out).toContain('&lt;div class="x"&gt;');
    expect(out).toContain('&amp;nbsp;');
    expect(out).toContain('&lt;/div&gt;');
    // No double-encoding like &amp;lt;div...
    expect(out).not.toContain('&amp;lt;');
  });

  it('keeps inline <code> untouched (never wraps a non-<pre> code)', () => {
    const html = '<p>use <code>const x = 1;</code> in a loop</p>';
    const out = applyCodeBlockFold(html);
    expect(out).toBe(html);
    expect(out).not.toContain('<details');
    expect(out).not.toContain('fold');
  });

  it('folds multiple consecutive code blocks independently', () => {
    const html = FENCE('js', NL(8)) + FENCE('ts', NL(8)) + FENCE('py', NL(8));
    const out = applyCodeBlockFold(html);
    const opens = out.match(/<details class="fold">/g) ?? [];
    expect(opens.length).toBe(3);
    // All three languages preserved.
    expect(out).toContain('language-js');
    expect(out).toContain('language-ts');
    expect(out).toContain('language-py');
  });
});

describe('applyCodeBlockFold — idempotency & edges', () => {
  it('is idempotent: re-applying does NOT re-fold an already-folded block', () => {
    const html = FENCE('js', NL(8));
    const once = applyCodeBlockFold(html);
    const twice = applyCodeBlockFold(once);
    // Same number of <details> opens (1) — no nesting.
    const opens = twice.match(/<details class="fold">/g) ?? [];
    expect(opens.length).toBe(1);
    // Inner <pre> is preserved.
    expect(twice).toContain('<pre><code class="hljs language-js">');
  });

  it('returns empty string for empty input', () => {
    expect(applyCodeBlockFold('')).toBe('');
  });

  it('returns the input unchanged if it has no <pre> blocks at all', () => {
    const html = '<p>hello</p><p>world</p>';
    expect(applyCodeBlockFold(html)).toBe(html);
  });

  it('leaves short code blocks alone even when surrounded by long ones', () => {
    const short = FENCE('js', NL(2));
    const long1 = FENCE('ts', NL(10));
    const long2 = FENCE('py', NL(10));
    const html = long1 + short + long2;
    const out = applyCodeBlockFold(html);
    const opens = out.match(/<details class="fold">/g) ?? [];
    expect(opens.length).toBe(2);
    // The short block is still present and untouched.
    expect(out).toContain(NL(2));
  });
});

describe('applyCodeBlockFold — options', () => {
  it('respects a custom threshold', () => {
    const html = FENCE('js', NL(3));
    // Default threshold (5) would not fold; threshold=2 should (3 > 2).
    expect(applyCodeBlockFold(html)).toBe(html);
    expect(applyCodeBlockFold(html, { threshold: 2 })).toContain('<details class="fold">');
  });

  it('respects a custom summaryOpen label', () => {
    const html = FENCE('js', NL(8));
    const out = applyCodeBlockFold(html, { summaryOpen: 'Reveal code' });
    expect(out).toContain('>Reveal code<');
    expect(out).toContain('aria-label="Reveal code"');
  });

  it('langs regex can disable folding for a specific language', () => {
    const html = FENCE('js', NL(8));
    // Reject "js" but allow others.
    const out = applyCodeBlockFold(html, { langs: /^(?!js$)[a-z0-9_+-]+$/i });
    expect(out).toBe(html);
    expect(out).not.toContain('<details');
  });
});
