// SPDX-License-Identifier: Apache-2.0
// Pulse Notes — code block fold helper (R181).
//
// Post-processes markdown-rendered HTML to wrap long fenced code blocks
// (5+ lines) in a <details>/<summary> collapse element so they don't
// take over the screen in note view. Only folds blocks that already
// have a `language-XXX` class (i.e. were highlighted by highlight.js) —
// plain unstyled blocks stay as-is so we don't surprise the user with
// a fold on something they may have just wanted to read at a glance.
//
// 0 new deps. Works in browser + jsdom (DOMParser) and pure node (regex).
// Never throws — on any error, returns the input unchanged.

export interface CodeFoldOptions {
  /** Minimum number of visible lines before a block is folded. Default 5. */
  threshold?: number;
  /** Regex tested against the detected language. Default word chars. */
  langs?: RegExp;
  /** Summary text shown when the block is collapsed. Default "Show code". */
  summaryOpen?: string;
  /** Reserved for v2 dynamic summary swap. Currently unused. */
  summaryClose?: string;
}

const DEFAULTS = {
  threshold: 5,
  langs: /^[a-z0-9_+-]+$/i,
  summaryOpen: 'Show code',
  summaryClose: 'Hide code',
} as const;

type ResolvedOptions = {
  threshold: number;
  langs: RegExp;
  summaryOpen: string;
  summaryClose: string;
};

/**
 * Wrap long fenced code blocks in <details> for collapse-on-click.
 *
 * @param html       Rendered markdown HTML (output of `renderMarkdown()`).
 * @param options    Optional thresholds, language filter, and labels.
 * @returns          Modified HTML with long code blocks wrapped, or the
 *                   input unchanged on any error (never throws).
 */
export function applyCodeBlockFold(html: string, options?: CodeFoldOptions): string {
  if (typeof html !== 'string' || html.length === 0) return html;
  const opts: ResolvedOptions = { ...DEFAULTS, ...(options ?? {}) };

  try {
    if (typeof DOMParser !== 'undefined' && typeof document !== 'undefined') {
      return applyWithDomParser(html, opts);
    }
    return applyWithRegex(html, opts);
  } catch {
    return html;
  }
}

// ----- DOMParser path (browser + jsdom) -----

function applyWithDomParser(html: string, opts: ResolvedOptions): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const pres = Array.from(doc.querySelectorAll('pre'));
  let changed = false;

  for (const pre of pres) {
    // Skip <pre> already inside a fold we (or someone else) added.
    if (pre.closest('details.fold')) continue;

    const code = pre.querySelector('code');
    if (!code) continue;

    const lang = detectLang(code.getAttribute('class') || '');
    if (!lang || !opts.langs.test(lang)) continue;

    const text = code.textContent || '';
    if (countLines(text) <= opts.threshold) continue;

    const details = doc.createElement('details');
    details.className = 'fold';

    const summary = doc.createElement('summary');
    summary.className = 'fold__summary';
    summary.setAttribute('aria-label', opts.summaryOpen);
    summary.textContent = opts.summaryOpen;

    const parent = pre.parentNode;
    if (!parent) continue;
    parent.insertBefore(details, pre);
    details.appendChild(summary);
    details.appendChild(pre);
    changed = true;
  }

  return changed ? doc.body.innerHTML : html;
}

// ----- Regex fallback (pure node / SSR) -----

function applyWithRegex(html: string, opts: ResolvedOptions): string {
  // Match <pre><code ATTRS>CONTENT</code></pre> non-greedy. ATTRS captures
  // everything up to the first '>' so the class attribute is preserved as-is.
  const re = /<pre><code([^>]*)>([\s\S]*?)<\/code><\/pre>/g;
  let result = '';
  let lastEnd = 0;
  let foldDepth = 0;
  let match: RegExpExecArray | null;
  let changed = false;

  while ((match = re.exec(html)) !== null) {
    const start = match.index;
    // Track <details> depth in the original html between the last match
    // and the current one, so we don't re-fold a <pre> that's already
    // inside a <details class="fold">.
    const segment = html.slice(lastEnd, start);
    foldDepth += countOccurrences(segment, /<details(\s|>)/g);
    foldDepth -= countOccurrences(segment, /<\/details>/g);
    if (foldDepth < 0) foldDepth = 0; // defensive: malformed input

    result += segment;

    if (foldDepth === 0) {
      const attrs = match[1] || '';
      const content = match[2] || '';
      const className = extractClass(attrs);
      const lang = className ? detectLang(className) : null;
      if (lang && opts.langs.test(lang)) {
        const decoded = decodeEntities(content);
        if (countLines(decoded) > opts.threshold) {
          result +=
            `<details class="fold">` +
            `<summary class="fold__summary" aria-label="${escapeAttr(opts.summaryOpen)}">` +
            `${escapeText(opts.summaryOpen)}` +
            `</summary>` +
            `<pre><code${attrs}>${content}</code></pre>` +
            `</details>`;
          changed = true;
          lastEnd = re.lastIndex;
          continue;
        }
      }
    }

    result += match[0];
    lastEnd = re.lastIndex;
  }

  result += html.slice(lastEnd);
  return changed ? result : html;
}

// ----- helpers -----

function detectLang(className: string): string | null {
  const m = /language-([a-z0-9_+-]+)/i.exec(className);
  return m ? m[1] : null;
}

function extractClass(attrs: string): string | null {
  const m = /class="([^"]*)"/i.exec(attrs);
  return m ? m[1] : null;
}

/**
 * POSIX-style line count. Trailing newline does not add a line.
 * - ""           -> 0
 * - "\n"         -> 1
 * - "abc"        -> 1
 * - "abc\n"      -> 1
 * - "abc\ndef"   -> 2
 */
function countLines(text: string): number {
  if (text.length === 0) return 0;
  const trimmed = text.replace(/\n$/, '');
  if (trimmed.length === 0) return 1; // a single "\n" is still one line
  return trimmed.split('\n').length;
}

function countOccurrences(s: string, re: RegExp): number {
  return s.match(re)?.length ?? 0;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
