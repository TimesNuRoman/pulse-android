<script lang="ts">
  import { parseTagInput, MAX_TAGS_PER_NOTE, normalizeTag } from '../../lib/notesStore';

  /**
   * R140 — tag input below the note title. Accepts:
   *   - single tag: `work` + Enter
   *   - comma-separated: `work, urgent` + Enter
   *   - `#`-prefixed shorthand: `#work #urgent` + Enter
   *
   * Validation: lowercase, alphanumeric + dash, 1-32 chars, must start
   * with [a-z0-9]. Invalid entries are silently dropped. Duplicates
   * within a single input are deduped (first wins). Hits the per-note
   * cap of 20 tags.
   *
   * Emits `add` with the parsed-and-validated array of tags to add
   * (caller is responsible for actually mutating the note store).
   */
  interface Props {
    /** Existing tags on the note (used to dedupe before emitting). */
    existingTags: string[];
    placeholder?: string;
    disabled?: boolean;
    onAdd?: (tags: string[]) => void;
    onRemove?: (tag: string) => void;
  }
  let {
    existingTags,
    placeholder = 'add tag…',
    disabled = false,
    onAdd,
    onRemove,
  }: Props = $props();

  let value: string = $state('');
  let lastError: string = $state('');

  function clearError(): void {
    if (lastError) lastError = '';
  }

  function commit(): string[] {
    const parsed = parseTagInput(value);
    value = '';
    clearError();
    if (parsed.length === 0) return [];
    // Dedupe against existing tags; report skipped as error.
    const existing = new Set(existingTags);
    const fresh: string[] = [];
    let skipped = 0;
    for (const t of parsed) {
      if (existing.has(t) || fresh.includes(t)) {
        skipped++;
        continue;
      }
      if (existingTags.length + fresh.length >= MAX_TAGS_PER_NOTE) {
        skipped++;
        continue;
      }
      fresh.push(t);
    }
    if (skipped > 0 && fresh.length === 0) {
      lastError = 'no valid tags';
    }
    return fresh;
  }

  function handleKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      const fresh = commit();
      if (fresh.length > 0) emit(fresh);
    } else if (e.key === ',' || e.key === ' ') {
      // Space / comma immediately commits the current buffer.
      if (value.length > 0) {
        e.preventDefault();
        const fresh = commit();
        if (fresh.length > 0) emit(fresh);
      }
    } else if (e.key === 'Backspace' && value.length === 0) {
      // Empty input + Backspace: emit the last existing tag for removal.
      // Caller can choose to ignore.
      if (existingTags.length > 0) {
        e.preventDefault();
        emitRemove(existingTags[existingTags.length - 1]!);
      }
    }
  }

  function handleBlur(): void {
    if (value.length > 0) {
      const fresh = commit();
      if (fresh.length > 0) emit(fresh);
    }
  }

  function handlePaste(e: ClipboardEvent): void {
    const pasted = e.clipboardData?.getData('text') ?? '';
    if (!/[,\s#]/.test(pasted)) return; // single tag paste — let default handle it
    e.preventDefault();
    const combined = (value + ' ' + pasted).trim();
    value = combined;
    const fresh = commit();
    if (fresh.length > 0) emit(fresh);
  }

  // Svelte 5 — callback props, not CustomEvent. The parent passes
  // `onAdd={(tags) => ...}` directly. An internal helper keeps the
  // keystroke handlers readable.
  function emit(tags: string[]): void {
    onAdd?.(tags);
  }
  function emitRemove(tag: string): void {
    onRemove?.(tag);
  }

  // For tests: expose a `parseNow` helper to verify the input's
  // current parsed value without having to fire keystrokes.
  export function parseNow(): string[] {
    return parseTagInput(value);
  }
  export function normalizeNow(raw: string): string | null {
    return normalizeTag(raw);
  }
</script>

<div class="tag-input" data-testid="tag-input-wrapper">
  <input
    bind:value
    type="text"
    class="tag-input__field"
    {placeholder}
    {disabled}
    autocomplete="off"
    autocapitalize="off"
    autocorrect="off"
    spellcheck="false"
    aria-label="Add tag"
    data-testid="tag-input"
    onkeydown={handleKey}
    onblur={handleBlur}
    onpaste={handlePaste}
    oninput={clearError}
  />
  {#if lastError}
    <span class="tag-input__error" data-testid="tag-input-error">{lastError}</span>
  {/if}
</div>

<style>
  .tag-input {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 28px;
  }
  .tag-input__field {
    height: 28px;
    padding: 0 8px;
    border: 0;
    border-bottom: 1px solid var(--tn-border, #414868);
    background: transparent;
    color: var(--tn-fg, #c0caf5);
    font-size: 14px;
    font-family: var(--tn-font-mono, monospace);
    min-width: 120px;
    outline: 0;
  }
  .tag-input__field:focus {
    border-bottom-color: var(--tn-accent-purple, #bb9af7);
  }
  .tag-input__field::placeholder {
    color: var(--tn-fg-muted, #565f89);
  }
  .tag-input__error {
    color: var(--tn-accent-red, #f7768e);
    font-size: 12px;
  }
</style>
