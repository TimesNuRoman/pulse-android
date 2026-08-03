// SPDX-License-Identifier: Apache-2.0
// Pulse Notes - markdown renderer (R136 + R159 footnotes)
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import rust from 'highlight.js/lib/languages/rust';
import python from 'highlight.js/lib/languages/python';
import markdown from 'highlight.js/lib/languages/markdown';
import type { PluginSimple } from 'markdown-it';
import { extractBacklinks, extractTags } from './notesBacklinks';
import { applyCodeBlockFold } from './markdownFold';

/** Code blocks with more than this many visible lines are wrapped in <details>. */
const CODE_FOLD_THRESHOLD = 5;

let md: MarkdownIt | null = null;

/**
 * Build (or return cached) markdown-it instance with Pulse Notes configuration.
 *
 * - GFM: enabled
 * - linkify: enabled
 * - breaks: false (no auto <br>)
 * - html: false (no raw HTML; sanitization-by-default)
 * - [[wikilink]] -> <a class="wikilink" data-target="...">title</a>
 * - #tag -> <a class="tag" data-tag="tag">#tag</a> (outside code blocks)
 * - highlight.js on fenced code blocks
 */
export function getMarkdownIt(): MarkdownIt {
  if (md) return md;

  hljs.registerLanguage('javascript', javascript);
  hljs.registerLanguage('js', javascript);
  hljs.registerLanguage('typescript', typescript);
  hljs.registerLanguage('ts', typescript);
  hljs.registerLanguage('bash', bash);
  hljs.registerLanguage('sh', bash);
  hljs.registerLanguage('json', json);
  hljs.registerLanguage('css', css);
  hljs.registerLanguage('html', xml);
  hljs.registerLanguage('xml', xml);
  hljs.registerLanguage('rust', rust);
  hljs.registerLanguage('rs', rust);
  hljs.registerLanguage('python', python);
  hljs.registerLanguage('py', python);
  hljs.registerLanguage('markdown', markdown);
  hljs.registerLanguage('md', markdown);

  md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: false,
    breaks: false,
    highlight: (str: string, lang: string): string => {
      if (lang && hljs.getLanguage(lang)) {
        try {
          const out = hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
          return `<pre><code class="hljs language-${escapeAttr(lang)}">${out}</code></pre>`;
        } catch {
          // fall through
        }
      }
      return `<pre><code>${md!.utils.escapeHtml(str)}</code></pre>`;
    },
  });

  // Inline [[wikilink]] - matches [[Title]] or [[Title|alias]]
  md.inline.ruler.after('emphasis', 'wikilink', (state, silent) => {
    const start = state.pos;
    const src = state.src;
    if (src.charCodeAt(start) !== 0x5b /* [ */) return false;
    if (src.charCodeAt(start + 1) !== 0x5b /* [ */) return false;
    const end = src.indexOf(']]', start + 2);
    if (end < 0) return false;

    const inner = src.slice(start + 2, end);
    if (inner.length === 0 || inner.includes('\n')) return false;

    if (!silent) {
      const token = state.push('wikilink', '', 0);
      const pipeIdx = inner.indexOf('|');
      if (pipeIdx >= 0) {
        token.attrs = [
          ['class', 'wikilink'],
          ['data-target', inner.slice(0, pipeIdx).trim()],
        ];
        token.content = inner.slice(pipeIdx + 1).trim();
      } else {
        token.attrs = [
          ['class', 'wikilink'],
          ['data-target', inner.trim()],
        ];
        token.content = inner.trim();
      }
    }
    state.pos = end + 2;
    return true;
  });

  // Inline #tag - matches #word at a word boundary.
  // Boundary rule (mirrors notesBacklinks.isTagStart):
  //   - start of string
  //   - preceded by whitespace AND two-back char is NOT ':' (avoids `color: #ff00aa`)
  //   - preceded by punctuation (NOT ':')
  //   - NOT preceded by alphanumeric / underscore (avoids `a#tag`)
  md.inline.ruler.after('wikilink', 'tag', (state, silent) => {
    const start = state.pos;
    const src = state.src;
    if (src.charCodeAt(start) !== 0x23 /* # */) return false;

    if (start > 0) {
      const prev = src.charCodeAt(start - 1);
      const isWord = (c: number) =>
        (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c === 0x5f;
      const isSpace = (c: number) => c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d;
      const isPunct = (c: number) =>
        c === 0x2c || c === 0x3b || c === 0x2e || c === 0x21 ||
        c === 0x3f || c === 0x28 || c === 0x29 || c === 0x7b ||
        c === 0x7d || c === 0x5b || c === 0x5d || c === 0x3c || c === 0x3e;

      if (isWord(prev)) return false;

      if (isSpace(prev)) {
        // Only do the CSS colon check for prev = single space (0x20).
        // newline/tab/CR means we're on a new word, so accept as tag.
        if (prev === 0x20) {
          if (start >= 2 && src.charCodeAt(start - 2) === 0x3a /* : */) return false;
        }
      } else if (prev === 0x3a /* : */) {
        // direct `: #` like `key:#tag` — not a tag
        return false;
      } else if (!isPunct(prev)) {
        return false;
      }
    }

    // Read word chars
    let i = start + 1;
    while (i < src.length) {
      const c = src.charCodeAt(i);
      if (
        (c >= 0x30 && c <= 0x39) ||
        (c >= 0x41 && c <= 0x5a) ||
        (c >= 0x61 && c <= 0x7a) ||
        c === 0x5f || // _
        c === 0x2d // -
      ) {
        i++;
      } else {
        break;
      }
    }
    if (i === start + 1) return false; // # alone is not a tag

    if (!silent) {
      const tag = src.slice(start + 1, i);
      const token = state.push('tag', '', 0);
      token.attrs = [
        ['class', 'tag'],
        ['data-tag', tag],
      ];
      token.content = src.slice(start, i);
    }
    state.pos = i;
    return true;
  });

  // Renderer for custom tokens -> anchor tags
  md.renderer.rules.wikilink = (tokens, idx) => {
    const token = tokens[idx];
    const target = token.attrGet('data-target') ?? '';
    const text = md!.utils.escapeHtml(token.content);
    return `<a class="wikilink" href="#wikilink/${encodeURIComponent(target)}" data-target="${escapeAttr(target)}">${text}</a>`;
  };
  md.renderer.rules.tag = (tokens, idx) => {
    const token = tokens[idx];
    const tag = token.attrGet('data-tag') ?? '';
    return `<a class="tag" href="#tag/${encodeURIComponent(tag)}" data-tag="${escapeAttr(tag)}">#${escapeHtml(tag)}</a>`;
  };

  return md;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

/**
 * Render markdown to HTML string. Returns safe HTML — html: false prevents
 * raw <script> tags from going through. Custom plugin HTML is built by us
 * with proper escaping, so XSS via wikilink/tag is mitigated.
 *
 * R159: footnotes pass — extracts `[^id]: text` defs before render, then
 * substitutes `[^id]` in the body with `<sup>` links and appends a
 * `<section class="footnotes">` at the bottom. Definitions in fenced code
 * blocks are ignored; references in `<pre>` blocks are not linkified.
 */
export function renderMarkdown(source: string): string {
  const src = source ?? '';
  if (src === '') return '';
  const { source: cleaned, defs } = extractFootnoteDefs(src);
  const html = getMarkdownIt().render(cleaned);
  const folded = applyCodeBlockFold(html, { threshold: CODE_FOLD_THRESHOLD });
  if (defs.length === 0) return folded;
  return renderFootnoteBody(folded, defs);
}

interface FootnoteDef {
  id: string;
  text: string;
  number: number;
}

/**
 * Extract `[^id]: text` definitions at the start of a line.
 * - Up to 3 leading spaces (standard markdown indented block).
 * - `id` is `\w+` (letters, digits, underscore) plus `-`.
 * - Defs inside fenced code blocks (``` or ~~~) are ignored.
 * - Duplicate ids: first occurrence wins.
 * - Multi-line def: continuation lines indented with 4+ spaces or a tab.
 * - Returns the source with def lines removed (and the def registry).
 */
function extractFootnoteDefs(source: string): { source: string; defs: FootnoteDef[] } {
  const lines = source.split('\n');
  const out: string[] = [];
  const defs: FootnoteDef[] = [];
  const seen = new Set<string>();
  let inFence = false;
  let fenceChar = '';

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fenceMatch = line.match(/^(\s{0,3})(`{3,}|~{3,})/);
    if (fenceMatch) {
      if (!inFence) {
        inFence = true;
        fenceChar = fenceMatch[2][0];
      } else if (line.trimStart().startsWith(fenceChar.repeat(3))) {
        inFence = false;
        fenceChar = '';
      }
    }

    if (!inFence) {
      const defMatch = line.match(/^(\s{0,3})\[\^([\w-]+)\]:[ \t]*(.*)$/);
      if (defMatch) {
        const id = defMatch[2];
        if (!seen.has(id)) {
          seen.add(id);
          let text = defMatch[3];
          // Look for indented continuation (4+ spaces or tab)
          let j = i + 1;
          while (j < lines.length) {
            const cont = lines[j];
            if (/^( {4,}|\t)/.test(cont)) {
              text += '\n' + cont.replace(/^( {4}|\t)/, '');
              j++;
            } else {
              break;
            }
          }
          // Trim trailing whitespace per line, then collapse trailing newlines.
          text = text.replace(/[ \t]+$/gm, '').replace(/\n+$/, '');
          defs.push({ id, text, number: 0 });
          i = j;
          continue;
        }
        // Duplicate def - drop the line, do not register a second entry
        i++;
        continue;
      }
    }

    out.push(line);
    i++;
  }

  return { source: out.join('\n'), defs };
}

/**
 * Post-process rendered HTML to:
 *   1. Replace each `[^id]` reference (outside `<pre>` blocks) with a
 *      `<sup><a>` link, IF a definition exists. Otherwise the text is kept
 *      as-is (no broken link).
 *   2. Assign sequential numbers to footnotes by first-reference order.
 *      Numeric ids (`[^1]`) display their number; named ids (`[^barker]`)
 *      display their label.
 *   3. Append a `<section class="footnotes">` listing all defs (in
 *      definition order), each with a back-link to its reference.
 */
function renderFootnoteBody(html: string, defs: FootnoteDef[]): string {
  const defMap = new Map<string, FootnoteDef>();
  for (const d of defs) defMap.set(d.id, d);

  // Split by <pre>...</pre> and <code>...</code> blocks; we only substitute
  // inside non-pre/non-code segments so refs inside code stay literal.
  const skipRe = /<pre>[\s\S]*?<\/pre>|<code>[\s\S]*?<\/code>/g;
  const segments: { text: string; skip: boolean }[] = [];
  let last = 0;
  for (const m of html.matchAll(skipRe)) {
    const idx = m.index ?? 0;
    if (idx > last) segments.push({ text: html.slice(last, idx), skip: false });
    segments.push({ text: m[0], skip: true });
    last = idx + m[0].length;
  }
  if (last < html.length) segments.push({ text: html.slice(last), skip: false });

  const refRe = /\[\^([\w-]+)\]/g;
  let counter = 0;
  const out: string[] = [];
  for (const seg of segments) {
    if (seg.skip) {
      out.push(seg.text);
      continue;
    }
    const replaced = seg.text.replace(refRe, (match, id: string) => {
      const def = defMap.get(id);
      if (!def) return match; // undefined ref - leave as plain text
      if (def.number === 0) {
        counter++;
        def.number = counter;
      }
      const label = isNumericId(id) ? String(def.number) : id;
      return (
        `<sup class="footnote-ref">` +
        `<a href="#fn-${escapeAttr(id)}" id="fnref-${escapeAttr(id)}" ` +
        `aria-describedby="fn-${escapeAttr(id)}">${escapeHtml(label)}</a>` +
        `</sup>`
      );
    });
    out.push(replaced);
  }

  // Build the section (in definition order, not number order).
  const items: string[] = [];
  for (const d of defs) {
    if (d.number === 0) continue; // never referenced
    items.push(
      `<li id="fn-${escapeAttr(d.id)}" value="${d.number}">` +
        `${escapeHtml(d.text)} ` +
        `<a href="#fnref-${escapeAttr(d.id)}" class="footnote-backref" ` +
        `aria-label="back to text">back</a>` +
        `</li>`
    );
  }
  if (items.length === 0) return out.join('');

  const section =
    `\n<section class="footnotes" aria-label="Footnotes">\n` +
    `<ol>\n${items.join('\n')}\n</ol>\n` +
    `</section>\n`;

  return out.join('') + section;
}

function isNumericId(id: string): boolean {
  return /^\d+$/.test(id);
}

/**
 * Extract plain-text + metadata for a note. Pure helper, useful for search/links.
 */
export function analyzeNote(source: string): {
  backlinks: string[];
  tags: string[];
  wordCount: number;
  charCount: number;
} {
  return {
    backlinks: extractBacklinks(source ?? ''),
    tags: extractTags(source ?? ''),
    wordCount: (source ?? '').trim().split(/\s+/).filter(Boolean).length,
    charCount: (source ?? '').length,
  };
}

// Re-export for tests
export const _internal = { wikilinkPlugin: null as PluginSimple | null, tagPlugin: null as PluginSimple | null };
