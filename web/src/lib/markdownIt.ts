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

/**
 * Whitelisted URL schemes for autolinks. Anything else (javascript:, data:,
 * vbscript:, file:, etc.) is rendered as plain text.
 */
const SAFE_URL_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

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
 * After rendering, an autolink pass upgrades linkify-generated anchors:
 *   <a href="...">           -> <a class="autolink" href="..." target="_blank" rel="noopener noreferrer">
 * Pre-existing class-bearing anchors (wikilink, tag) are left untouched.
 * Bare URLs / <URL> / email are already detected by markdown-it linkify;
 * this pass adds the missing attributes and the scheme whitelist check.
 */
export function renderMarkdown(source: string): string {
  const html = getMarkdownIt().render(source ?? '');
  return autolink(html);
}

/**
 * Post-render autolink pass. Matches the full <a ...>...</a> block emitted
 * by markdown-it linkify, then:
 *   - skips anchors that already carry a class (wikilink, tag)
 *   - validates the URL scheme against a whitelist
 *   - if unsafe, returns the inner text only (drops the anchor entirely)
 *   - if safe, rewrites the opening tag to add class + target + rel
 *
 * The body text is left untouched: linkify/markdown-it already escaped any
 * HTML metacharacters in the source, so XSS via URL text is mitigated.
 */
function autolink(html: string): string {
  return html.replace(/<a\s+href="([^"]*)"([^>]*)>([\s\S]*?)<\/a>/g, (_match, href: string, rest: string, body: string) => {
    if (/\bclass="[^"]*"/.test(rest)) return _match;

    const schemeMatch = href.match(/^([a-zA-Z][a-zA-Z0-9+.\-]*):/);
    const scheme = schemeMatch ? schemeMatch[1].toLowerCase() + ':' : '';
    if (scheme && !SAFE_URL_SCHEMES.has(scheme)) {
      // Strip the anchor; keep the visible text. Linkify usually filters
      // javascript:/data: before they ever reach here, but defense in depth.
      return body;
    }

    return `<a class="autolink" href="${href}" target="_blank" rel="noopener noreferrer">${body}</a>`;
  });
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
