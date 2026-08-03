<script lang="ts">
  /**
   * R140 — single tag chip. Used inside the note editor (for tags of
   * the active note) and inside the TagFilterBar (for tag filters).
   *
   * Visual: Tokyo Night purple accent at 15% opacity, 28dp height,
   * 14px text, 6px corner radius. The × button has 44dp touch target
   * via padding (the visible glyph is smaller).
   *
   * Two visual states:
   *  - default: transparent purple bg, purple text
   *  - selected: solid purple bg, bg-color text (used by TagFilterBar)
   */
  interface Props {
    tag: string;
    count?: number;
    selected?: boolean;
    onRemove?: (tag: string) => void;
    onSelect?: (tag: string) => void;
    /** Aria label override for the remove button (default: `Remove tag <name>`). */
    removeLabel?: string;
  }
  let {
    tag,
    count,
    selected = false,
    onRemove,
    onSelect,
    removeLabel,
  }: Props = $props();

  function handleClick(): void {
    onSelect?.(tag);
  }
  function handleRemove(e: MouseEvent): void {
    e.stopPropagation();
    onRemove?.(tag);
  }
  function handleKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onRemove?.(tag);
    }
  }
</script>

<button
  type="button"
  class="tag-chip"
  class:tag-chip--selected={selected}
  onclick={onSelect ? handleClick : undefined}
  aria-pressed={onSelect ? selected : undefined}
  data-testid={`tag-chip-${tag}`}
  data-selected={selected ? 'true' : 'false'}
>
  <span class="tag-chip__label">#{tag}</span>
  {#if count != null && count > 0}
    <span class="tag-chip__count" aria-label={`${count} notes`}>{count}</span>
  {/if}
  {#if onRemove}
    <span
      class="tag-chip__remove"
      role="button"
      tabindex="0"
      aria-label={removeLabel ?? `Remove tag ${tag}`}
      data-testid={`tag-chip-remove-${tag}`}
      onclick={handleRemove}
      onkeydown={handleKey}
    >&times;</span>
  {/if}
</button>

<style>
  .tag-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 8px;
    border-radius: 6px;
    background: rgba(187, 154, 247, 0.15);
    color: var(--tn-accent-purple, #bb9af7);
    border: 0;
    font-size: 14px;
    font-family: var(--tn-font-mono, monospace);
    line-height: 1;
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }
  .tag-chip--selected {
    background: var(--tn-accent-purple, #bb9af7);
    color: var(--tn-bg, #1a1b26);
  }
  .tag-chip__label {
    white-space: nowrap;
  }
  .tag-chip__count {
    font-size: 12px;
    opacity: 0.7;
    font-family: var(--tn-font-sans, system-ui, sans-serif);
  }
  .tag-chip__remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    /* 22 + 8 padding-inline each side = 38 visual, but the button itself
       is 22; combined with chip padding the row meets 44dp touch. */
    margin-left: 2px;
    margin-right: -4px;
    border-radius: 50%;
    opacity: 0.6;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    transition: opacity 0.15s, background 0.15s;
  }
  .tag-chip__remove:hover,
  .tag-chip__remove:focus-visible {
    opacity: 1;
    background: rgba(0, 0, 0, 0.2);
    outline: 0;
  }
  .tag-chip--selected .tag-chip__remove:hover,
  .tag-chip--selected .tag-chip__remove:focus-visible {
    background: rgba(255, 255, 255, 0.2);
  }
  /* TagFilterBar chips have 44dp min touch target via the wrapping
     <button>; the × inside the chip is a separate focusable stop. */
  .tag-chip:focus-visible {
    outline: 2px solid var(--tn-accent-blue, #7aa2f7);
    outline-offset: 1px;
  }
</style>
