/**
 * Hand-rolled markdown subset for Pulse Notes preview.
 *
 * Why hand-rolled and not markdown-it (already used by markdownIt.ts)?
 *   - The R118 onboarding promise is "Markdown + [[wikilinks]]". The
 *     existing markdown-it pipeline renders wikilinks as plain anchors
 *     with no existence check. R136 needs `[[Title]]` to resolve against
 *     the live notes store and return a `{ html, wikilinks: [{title, exists}] }`
 *     pair so the preview can wire up click-to-navigate and click-to-create.
 *   - Keeping this parser separate lets us preserve markdown-it for the
 *     rich rendering (linkify, code highlighting, GFM tables) while this
 *     hand-rolled one drives the wikilink-aware preview.
 *
 * Subset supported:
 *   - Headings: `# H1`, `## H2`, `### H3` (h4+ are not part of the brief)
 *   - Bold: `**text**`
 *   - Italic: `*text*` (single-asterisk only)
 *   - Inline code: `` `text` ``
 *   - Fenced code block: ` ```lang\n...\n``` ` (language optional)
 *   - Bullet list: `- item`
 *   - Numbered list: `1. item`
 *   - Blockquote: `> text`
 *   - Wikilink: `[[Title]]` or `[[Title|alias]]`
 *   - Table (R146): GFM pipe syntax with optional alignment via the
 *     separator row. Header must start with `|`. Separator cells must be
 *     a run of `-` (1+) optionally bracketed by `:`; `:---` = left,
 *     `---:` = right, `:---:` = center, plain `---` = left (GFM default).
 *     Cell content is passed through renderInline so `**bold**`, `*italic*`,
 *     `` `code` `` and `[[wikilink]]` all work inside cells. Pipe escape
 *     (`\|`) is intentionally NOT supported in v1 — strict mode only.
 *
 * Sanitization model:
 *   - User-supplied HTML is escaped by the parser (it never appears raw).
 *   - Code block / inline code content is extracted and escaped BEFORE
 *     the rest of the parsing runs, so wikilink / bold / italic markers
 *     inside code are treated as literal characters.
 *   - Inline transformations (wikilink, italic, bold) introduce their
 *     own HTML tags. We use a placeholder-then-escape pattern: each
 *     transformation replaces its output with a sentinel string, we
 *     escape the entire text (sentinels survive because they contain
 *     no HTML special chars), then we swap the sentinels back to HTML.
 *   - Output is safe to drop into `{@html ...}` without further filtering.
 */
import type { Note } from './notesBacklinks';

export interface WikilinkRef {
  title: string;
  exists: boolean;
}

export interface RenderResult {
  html: string;
  wikilinks: WikilinkRef[];
}

// Use NUL (\u0000) / SOH (\u0001) as placeholder delimiters: not legal in
// user-typed markdown, no HTML special chars, and never collide with
// anything in the output.
const CODE_BLOCK_PLACEHOLDER = '\u0000CODEBLOCK';
const INLINE_CODE_PLACEHOLDER = '\u0001INLINECODE';
const A_SENTINEL_PREFIX = '\u0001A';
const EM_SENTINEL_PREFIX = '\u0001EM';
const STRONG_SENTINEL_PREFIX = '\u0001STRONG';
const INLINE_CODE_SENTINEL_PREFIX = '\u0001IC';

const CODE_BLOCK_RE = /```([A-Za-z0-9_-]*)\n([\s\S]*?)\n```/g;
const INLINE_CODE_RE = /`([^`\n]+?)`/g;
const WIKILINK_RE = /\[\[([^\[\]\n]+?)\]\]/g;
// Italic must reject the `**` of bold. Lookbehind/lookahead enforce that.
const ITALIC_RE = /(?<!\*)\*(?!\*)([^*\n]+?)(?<!\*)\*(?!\*)/g;
const BOLD_RE = /\*\*([^*\n]+?)\*\*/g;

export function render(source: string, notes: Note[]): RenderResult {
  if (source == null) return { html: '', wikilinks: [] };
  if (!Array.isArray(notes)) notes = [];

  const titleSet = new Set<string>();
  for (const n of notes) {
    if (n && typeof n.title === 'string') titleSet.add(n.title);
  }

  const wikilinks: WikilinkRef[] = [];
  const seen = new Set<string>();

  // 1. Extract fenced code blocks. Their content must not be re-parsed for
  //    inline markdown (a `<script>` inside a code block should appear as
  //    literal text, not be executed). We escape the inner content here.
  const codeBlocks: string[] = [];
  let text = source.replace(CODE_BLOCK_RE, (_match, lang: string, code: string) => {
    const idx = codeBlocks.length;
    const langAttr = lang ? ` class="language-${escapeAttr(lang)}"` : '';
    codeBlocks.push(`<pre><code${langAttr}>${escapeHtml(code)}</code></pre>`);
    return `\n\n${CODE_BLOCK_PLACEHOLDER}${idx}\n\n`;
  });

  // 2. Extract inline code. Same rationale as code blocks: inner content
  //    is escaped, not parsed.
  const inlineCodes: string[] = [];
  text = text.replace(INLINE_CODE_RE, (_match, code: string) => {
    const idx = inlineCodes.length;
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return INLINE_CODE_PLACEHOLDER + idx;
  });

  // 3. Split on blank lines into blocks. Each block is a single structural
  //    element (paragraph, heading, list, blockquote, code-block placeholder).
  const blocks = text.split(/\n\s*\n/);

  const html = blocks
    .map((block) =>
      renderBlock(block, codeBlocks, titleSet, wikilinks, seen, inlineCodes),
    )
    .filter((s) => s.length > 0)
    .join('\n');

  return { html, wikilinks };
}

function renderBlock(
  block: string,
  codeBlocks: string[],
  titleSet: Set<string>,
  wikilinks: WikilinkRef[],
  seen: Set<string>,
  inlineCodes: string[],
): string {
  const trimmed = block.trim();
  if (trimmed === '') return '';

  // Code block placeholder (from the extraction step above).
  if (trimmed.startsWith(CODE_BLOCK_PLACEHOLDER)) {
    const idx = Number(trimmed.slice(CODE_BLOCK_PLACEHOLDER.length));
    return codeBlocks[idx] ?? '';
  }

  // Headings: only the exact line shape. The text inside is inlined.
  const h1 = trimmed.match(/^# (.+)$/);
  if (h1) return `<h1>${renderInline(h1[1], titleSet, wikilinks, seen, inlineCodes)}</h1>`;
  const h2 = trimmed.match(/^## (.+)$/);
  if (h2) return `<h2>${renderInline(h2[1], titleSet, wikilinks, seen, inlineCodes)}</h2>`;
  const h3 = trimmed.match(/^### (.+)$/);
  if (h3) return `<h3>${renderInline(h3[1], titleSet, wikilinks, seen, inlineCodes)}</h3>`;

  const lines = trimmed.split('\n');

  // Table (R146): GitHub-flavored pipe syntax. Header + separator + body.
  // Detection is strict: header must start with `|`, each separator cell
  // must be a run of `-` (1+) optionally bracketed by `:`, header and
  // separator must have the same column count. Inline markdown is applied
  // per cell via renderInline so the existing sanitization pipeline still
  // escapes raw HTML.
  if (lines.length >= 2) {
    const t = parseTable(lines, titleSet, wikilinks, seen, inlineCodes);
    if (t.isTable) return t.html;
  }

  // Blockquote: every line starts with `> ` or `>`.
  if (lines.every((l) => /^>\s?/.test(l))) {
    const content = lines
      .map((l) => l.replace(/^>\s?/, ''))
      .join(' ')
      .trim();
    return `<blockquote>${renderInline(content, titleSet, wikilinks, seen, inlineCodes)}</blockquote>`;
  }

  // Unordered list: every non-empty line starts with `- `.
  if (lines.every((l) => l === '' || /^-\s+/.test(l))) {
    const items = lines
      .filter((l) => l !== '')
      .map((l) => renderInline(l.replace(/^-\s+/, ''), titleSet, wikilinks, seen, inlineCodes))
      .map((c) => `<li>${c}</li>`)
      .join('');
    return `<ul>${items}</ul>`;
  }

  // Ordered list: every non-empty line starts with `\d+. `.
  if (lines.every((l) => l === '' || /^\d+\.\s+/.test(l))) {
    const items = lines
      .filter((l) => l !== '')
      .map((l) => renderInline(l.replace(/^\d+\.\s+/, ''), titleSet, wikilinks, seen, inlineCodes))
      .map((c) => `<li>${c}</li>`)
      .join('');
    return `<ol>${items}</ol>`;
  }

  // Paragraph: join multi-line blocks with a single space. Soft line break
  // is not converted to <br> (matches the markdown-it behavior we use elsewhere).
  const joined = trimmed.replace(/\n/g, ' ');
  return `<p>${renderInline(joined, titleSet, wikilinks, seen, inlineCodes)}</p>`;
}

function renderInline(
  text: string,
  titleSet: Set<string>,
  wikilinks: WikilinkRef[],
  seen: Set<string>,
  inlineCodes: string[],
): string {
  // Order matters:
  //   1. Wikilinks first: unique [[ ]] pattern, replaces with a sentinel.
  //   2. Italic before bold: italic's lookbehind/lookahead rejects `**`,
  //      so it won't double-process a bold.
  //   3. Bold: by now the only `*` we want to match are isolated pairs.
  //   4. Inline code placeholders: restored last (their content was escaped
  //      at extraction time and contains HTML, so they survive escapeHtml).
  //
  // After all transformations, escape the remaining text. The sentinels
  // we use contain only \u0001 / digits, so they pass through escapeHtml
  // unchanged. We then swap each sentinel back to the HTML it represents.

  const sentinels: Array<[string, string]> = [];

  let out = text.replace(WIKILINK_RE, (_match, inner: string) => {
    const pipeIdx = inner.indexOf('|');
    const target = (pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner).trim();
    const display = (pipeIdx >= 0 ? inner.slice(pipeIdx + 1) : inner).trim();
    if (!target) return inner;
    const exists = titleSet.has(target);
    if (!seen.has(target)) {
      seen.add(target);
      wikilinks.push({ title: target, exists });
    }
    const cls = exists ? 'wikilink' : 'wikilink wikilink--broken';
    const html =
      `<a class="${cls}" href="#/notes/${encodeURIComponent(target)}"` +
      ` data-title="${escapeAttr(target)}" role="link" tabindex="0">` +
      `${escapeHtml(display || target)}</a>`;
    const sentinel = `${A_SENTINEL_PREFIX}${sentinels.length}\u0001`;
    sentinels.push([sentinel, html]);
    return sentinel;
  });

  out = out.replace(ITALIC_RE, (_match, content: string) => {
    const html = `<em>${escapeHtml(content)}</em>`;
    const sentinel = `${EM_SENTINEL_PREFIX}${sentinels.length}\u0001`;
    sentinels.push([sentinel, html]);
    return sentinel;
  });

  out = out.replace(BOLD_RE, (_match, content: string) => {
    const html = `<strong>${escapeHtml(content)}</strong>`;
    const sentinel = `${STRONG_SENTINEL_PREFIX}${sentinels.length}\u0001`;
    sentinels.push([sentinel, html]);
    return sentinel;
  });

  // Inline code placeholders from the extraction step. Each becomes a
  // sentinel, then we escape the rest of the text, then we swap them
  // back to the pre-escaped <code>...</code> HTML.
  out = out.replace(
    new RegExp(INLINE_CODE_PLACEHOLDER + '(\\d+)', 'g'),
    (_match, idx: string) => {
      const html = inlineCodes[Number(idx)] ?? '';
      const sentinel = `${INLINE_CODE_SENTINEL_PREFIX}${sentinels.length}\u0001`;
      sentinels.push([sentinel, html]);
      return sentinel;
    },
  );

  // Now escape the remaining text. All sentinels survive because they
  // contain only \u0001 / digits — no HTML special chars.
  out = escapeHtml(out);

  // Swap sentinels back to their HTML representations.
  for (const [sentinel, html] of sentinels) {
    out = out.split(sentinel).join(html);
  }

  return out;
}

// R146 — table support. The separator row encodes alignment: a leading
// `:` is left-align, a trailing `:` is right-align, both is center. Plain
// `---` (or any run of dashes) is left-align — the GFM default. The
// `-+` quantifier is intentionally 1+ (not 3+) to match the GFM spec.
type Alignment = 'left' | 'center' | 'right';

const TABLE_LINE_START_RE = /^\s*\|/;
const TABLE_SEP_CELL_RE = /^\s*:?-+:?\s*$/;

function splitTableRow(line: string): string[] {
  // Strip leading/trailing `|` if present, then split the inner text on
  // `|`. Both styles are accepted (with or without outer pipes) so the
  // parser is forgiving on small typos.
  const trimmed = line.trim();
  let inner = trimmed;
  if (inner.startsWith('|')) inner = inner.slice(1);
  if (inner.endsWith('|')) inner = inner.slice(0, -1);
  return inner.split('|');
}

function parseAlignment(sepCell: string): Alignment {
  const s = sepCell.trim();
  const leftColon = s.startsWith(':');
  const rightColon = s.endsWith(':');
  if (leftColon && rightColon) return 'center';
  if (rightColon) return 'right';
  return 'left';
}

function parseTable(
  lines: string[],
  titleSet: Set<string>,
  wikilinks: WikilinkRef[],
  seen: Set<string>,
  inlineCodes: string[],
): { html: string; isTable: boolean } {
  if (lines.length < 2) return { html: '', isTable: false };

  const headerLine = lines[0];
  const sepLine = lines[1];

  // Both header and separator must start with `|`. Without this guard the
  // parser would try to interpret a 2-line indented note or a list with
  // matching widths as a table.
  if (!TABLE_LINE_START_RE.test(headerLine)) return { html: '', isTable: false };
  if (!TABLE_LINE_START_RE.test(sepLine)) return { html: '', isTable: false };

  const headerCells = splitTableRow(headerLine);
  const sepCells = splitTableRow(sepLine);

  // Column count must match between header and separator; otherwise fall
  // back to paragraph rendering and let the block-level fallback handle it.
  if (headerCells.length === 0) return { html: '', isTable: false };
  if (headerCells.length !== sepCells.length) return { html: '', isTable: false };
  for (const c of sepCells) {
    if (!TABLE_SEP_CELL_RE.test(c)) return { html: '', isTable: false };
  }

  const alignments = sepCells.map(parseAlignment);
  const colspan = headerCells.length;

  // Header row — `<th scope="col">` per hard rule 12 (accessibility). The
  // class hooks the alignment into the MarkdownPreview stylesheet.
  const thCells = headerCells
    .map((cell, i) => {
      const align = alignments[i] ?? 'left';
      const text = cell.trim();
      return `<th scope="col" class="align-${align}">${renderInline(
        text,
        titleSet,
        wikilinks,
        seen,
        inlineCodes,
      )}</th>`;
    })
    .join('');

  // Body rows. Each row is split into cells, then padded / truncated to
  // match the header column count. Empty / blank lines are skipped.
  const bodyRows: string[] = [];
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const cells = splitTableRow(line);
    const tdParts: string[] = [];
    for (let j = 0; j < colspan; j++) {
      const cell = (cells[j] ?? '').trim();
      const align = alignments[j] ?? 'left';
      tdParts.push(
        `<td class="align-${align}">${renderInline(
          cell,
          titleSet,
          wikilinks,
          seen,
          inlineCodes,
        )}</td>`,
      );
    }
    bodyRows.push(`<tr>${tdParts.join('')}</tr>`);
  }

  const head = `<thead>\n<tr>${thCells}</tr>\n</thead>`;
  // No body rows → omit <tbody> entirely. The empty <tbody> would still
  // be valid HTML but it adds noise and breaks the "table-with-just-a-
  // header" UI test (a single header line is rare; the user almost always
  // wants at least one data row).
  const body = bodyRows.length > 0 ? `<tbody>\n${bodyRows.join('\n')}\n</tbody>` : '';
  const html = `<table>\n${head}${body.length > 0 ? `\n${body}` : ''}\n</table>`;

  return { html, isTable: true };
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
