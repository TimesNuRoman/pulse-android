/**
 * Notes backlinks & tags — pure functions, no store dependency.
 *
 * The note store calls these to maintain the backlink index. They're pure so
 * they can be unit-tested without Svelte or DOM, and so a future "import notes
 * from file" feature can re-use them.
 */

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  tags?: string[];
}

const WIKILINK_RE = /\[\[([^\[\]\n]+?)\]\]/g;
const TAG_FIND_RE = /#([A-Za-z][A-Za-z0-9_-]{0,63})/g;

/**
 * Decide whether a `#` at `hashPos` starts a tag in `content`.
 *
 * Rules:
 *  - At start of string: yes
 *  - Preceded by whitespace AND two-back char is not `:` (to avoid `color: #ff00aa`,
 *    which is a CSS hex color, not a tag)
 *  - Preceded by punctuation: yes (except `:` which suggests CSS-like syntax)
 *  - Preceded by alphanumeric / underscore: no (avoids matching in the middle of words)
 */
function isTagStart(content: string, hashPos: number): boolean {
  if (hashPos === 0) return true;
  const prev = content.charCodeAt(hashPos - 1);
  // newline / tab / CR = definitely a new word, so it's a tag (no CSS context)
  if (prev === 0x09 || prev === 0x0a || prev === 0x0d) return true;
  // single space = potentially after a colon like `key: #value`
  if (prev === 0x20) {
    // CSS-like check: `: #hex` on the SAME line. If the char two back is a
    // colon, this is a CSS value, not a tag. We only do this check for
    // single-space prev — newline/tab/CR are handled above as "new word".
    if (hashPos >= 2 && content.charCodeAt(hashPos - 2) === 0x3a /* : */) return false;
    return true;
  }
  // punctuation: , ; . ! ? ( ) { } [ ] < > (NOT : which suggests CSS property)
  if (
    prev === 0x2c || prev === 0x3b || prev === 0x2e || prev === 0x21 ||
    prev === 0x3f || prev === 0x28 || prev === 0x29 || prev === 0x7b ||
    prev === 0x7d || prev === 0x5b || prev === 0x5d || prev === 0x3c ||
    prev === 0x3e
  ) {
    return true;
  }
  return false;
}

/**
 * Extract [[wikilink]] targets from markdown. Each unique target appears once,
 * in first-encounter order. Target = the part before any `|` alias.
 *
 *   "[[Project A]]"            -> ["Project A"]
 *   "[[Project A|click here]]" -> ["Project A"]
 *   "[[A]] and [[A]]"          -> ["A"]   (deduped)
 *   "no links here"            -> []
 */
export function extractBacklinks(content: string): string[] {
  if (!content) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of content.matchAll(WIKILINK_RE)) {
    const inner = m[1];
    if (!inner) continue;
    const pipeIdx = inner.indexOf('|');
    const target = (pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner).trim();
    if (target.length === 0) continue;
    if (!seen.has(target)) {
      seen.add(target);
      out.push(target);
    }
  }
  return out;
}

/**
 * Extract #tag patterns from markdown. Each unique tag appears once, lowercased.
 *
 *   "#rust and #Rust"    -> ["rust"]
 *   "color: #ff00aa"     -> []   (preceded by `:`, CSS hex color, not a tag)
 *   "a#tag"              -> []   (no word boundary, not a tag)
 *   "```css\n#foo\n```"  -> ["foo"]   (we don't filter code fences here; that's the caller's job)
 *
 * Note: this function does NOT skip code fences. Use `analyzeNote` for that.
 */
export function extractTags(content: string): string[] {
  if (!content) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  TAG_FIND_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_FIND_RE.exec(content))) {
    if (!isTagStart(content, m.index)) continue;
    const tag = m[1];
    if (!tag) continue;
    const lower = tag.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      out.push(lower);
    }
  }
  return out;
}

/**
 * Extract ALL #tag occurrences (with duplicates, lowercased). Used by
 * `countTags` to count usage, not unique mentions.
 */
export function extractAllTags(content: string): string[] {
  if (!content) return [];
  const out: string[] = [];
  TAG_FIND_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_FIND_RE.exec(content))) {
    if (!isTagStart(content, m.index)) continue;
    const tag = m[1];
    if (!tag) continue;
    out.push(tag.toLowerCase());
  }
  return out;
}

/**
 * Build a backlink index: target (case-insensitive) -> list of source notes.
 *
 * Note: the `target` here is the wikilink's resolved title. Because notes
 * currently only identify by id+title, we index by lowercased title.
 */
export function buildBacklinkIndex(notes: Note[]): Map<string, Note[]> {
  const idx = new Map<string, Note[]>();
  for (const note of notes ?? []) {
    const targets = extractBacklinks(note.content);
    for (const target of targets) {
      const key = target.toLowerCase();
      const list = idx.get(key);
      if (list) {
        if (!list.find((n) => n.id === note.id)) list.push(note);
      } else {
        idx.set(key, [note]);
      }
    }
  }
  return idx;
}

/**
 * Find notes that link TO the given note title (case-insensitive).
 */
export function findBacklinksTo(
  title: string,
  notes: Note[],
): Note[] {
  if (!title) return [];
  const idx = buildBacklinkIndex(notes);
  return idx.get(title.toLowerCase()) ?? [];
}

/**
 * Count tag usage across all notes. Returns Map<tagLower, count> where count
 * is the TOTAL number of tag mentions (not unique-per-note).
 */
export function countTags(notes: Note[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const n of notes ?? []) {
    for (const t of extractAllTags(n.content)) {
      out.set(t, (out.get(t) ?? 0) + 1);
    }
  }
  return out;
}
