<script lang="ts">
  import TagChip from './TagChip.svelte';

  /**
   * R140 — horizontal scrollable chip row that lives at the top of
   * NotesView. Tapping a chip toggles it in the parent's `selected`
   * set (OR filter — multiple selections match any).
   *
   * If there are no tags yet, renders nothing (the row is hidden).
   * If `selected` is non-empty, the bar stays visible even when the
   * tag list itself would otherwise be empty (so the user can
   * deselect).
   */
  interface Props {
    tags: { tag: string; count: number }[];
    selected: string[];
    onChange?: (next: string[]) => void;
  }
  let { tags, selected, onChange }: Props = $props();

  const selectedSet = $derived(new Set(selected));

  function toggle(tag: string): void {
    if (selectedSet.has(tag)) {
      onChange?.(selected.filter((t) => t !== tag));
    } else {
      onChange?.([...selected, tag]);
    }
  }

  function clearAll(): void {
    onChange?.([]);
  }

  const hasTags = $derived(tags.length > 0);
  const hasSelection = $derived(selected.length > 0);
</script>

{#if hasTags || hasSelection}
  <div class="tag-filter-bar" data-testid="tag-filter-bar" role="toolbar" aria-label="Filter notes by tag">
    <div class="tag-filter-bar__scroll" data-testid="tag-filter-bar-scroll">
      {#each tags as t (t.tag)}
        <TagChip
          tag={t.tag}
          count={t.count}
          selected={selectedSet.has(t.tag)}
          onSelect={toggle}
        />
      {/each}
    </div>
    {#if hasSelection}
      <button
        type="button"
        class="tag-filter-bar__clear"
        onclick={clearAll}
        data-testid="tag-filter-clear"
        aria-label="Clear tag filter"
      >
        Clear
      </button>
    {/if}
  </div>
{/if}

<style>
  .tag-filter-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 48px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--tn-border, #414868);
    background: var(--tn-bg-elevated, #24283b);
  }
  .tag-filter-bar__scroll {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    gap: 8px;
    overflow-x: auto;
    overflow-y: hidden;
    /* Hide scrollbar visually but keep it functional for keyboard / a11y. */
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .tag-filter-bar__scroll::-webkit-scrollbar {
    display: none;
  }
  .tag-filter-bar__clear {
    flex: 0 0 auto;
    height: 28px;
    padding: 0 10px;
    border-radius: 6px;
    background: transparent;
    color: var(--tn-fg-dim, #9aa5ce);
    border: 1px solid var(--tn-border, #414868);
    font-size: 12px;
    cursor: pointer;
    min-height: var(--tn-touch-min, 44px); /* M3 — R95b */
    display: inline-flex;
    align-items: center;
  }
  .tag-filter-bar__clear:hover {
    color: var(--tn-fg, #c0caf5);
    border-color: var(--tn-accent-blue, #7aa2f7);
  }
</style>
