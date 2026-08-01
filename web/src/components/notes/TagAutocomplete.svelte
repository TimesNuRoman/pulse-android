<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { hapticImpact } from '$lib/capacitor';

  export interface TagSuggestion {
    tag: string;
    count: number;
  }

  interface Props {
    open: boolean;
    query: string;
    tags: TagSuggestion[];
    onSelect: (tag: string) => void;
    onDismiss: () => void;
    anchor?: 'top' | 'bottom';
  }

  let { open, query, tags, onSelect, onDismiss, anchor = 'top' }: Props = $props();

  let activeIndex = $state(0);
  let listEl: HTMLUListElement | undefined = $state();

  const filtered = $derived.by((): TagSuggestion[] => {
    const q = (query ?? '').toLowerCase();
    if (!q) {
      return [...tags].sort((a, b) => b.count - a.count).slice(0, 8);
    }
    // Fuzzy: substring match, then prioritize exact-prefix, then by usage count.
    const matches = tags.filter((t) => t.tag.toLowerCase().includes(q));
    matches.sort((a, b) => {
      const aPrefix = a.tag.toLowerCase().startsWith(q) ? 0 : 1;
      const bPrefix = b.tag.toLowerCase().startsWith(q) ? 0 : 1;
      if (aPrefix !== bPrefix) return aPrefix - bPrefix;
      return b.count - a.count;
    });
    return matches.slice(0, 8);
  });

  // Reset active index when list changes
  $effect(() => {
    const _ = filtered.length;
    activeIndex = 0;
  });

  // Close on Escape
  function onKey(e: KeyboardEvent): void {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      onDismiss();
      return;
    }
    if (filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % filtered.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + filtered.length) % filtered.length;
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const choice = filtered[activeIndex];
      if (choice) {
        void hapticImpact({ light: true });
        onSelect(choice.tag);
      }
    }
  }

  $effect(() => {
    if (!open) return;
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  onMount(() => {
    // prevent body scroll when open (mobile keyboard)
  });

  onDestroy(() => {
    window.removeEventListener('keydown', onKey, true);
  });
</script>

{#if open && filtered.length > 0}
  <div
    class="tag-ac"
    class:tag-ac--top={anchor === 'top'}
    class:tag-ac--bottom={anchor === 'bottom'}
    data-testid="tag-autocomplete"
    role="listbox"
    aria-label="Tag suggestions"
  >
    <ul class="tag-ac__list" bind:this={listEl}>
      {#each filtered as item, i (item.tag)}
        <li
          class="tag-ac__item"
          class:tag-ac__item--active={i === activeIndex}
          role="option"
          aria-selected={i === activeIndex}
          data-testid={`tag-suggestion-${item.tag}`}
          data-tag={item.tag}
        >
          <button
            type="button"
            class="tag-ac__btn"
            onclick={() => {
              void hapticImpact({ light: true });
              onSelect(item.tag);
            }}
            onmouseenter={() => (activeIndex = i)}
            onfocus={() => (activeIndex = i)}
          >
            <span class="tag-ac__hash" aria-hidden="true">#</span>
            <span class="tag-ac__name">{item.tag}</span>
            <span class="tag-ac__count" aria-label={`${item.count} notes`}>{item.count}</span>
          </button>
        </li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .tag-ac {
    position: absolute;
    left: 0;
    right: 0;
    z-index: 50;
    background: var(--tn-bg-elevated, #24283b);
    border: 1px solid var(--tn-border, #414868);
    border-radius: var(--tn-radius-md, 12px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    max-height: 50vh;
    overflow-y: auto;
  }
  .tag-ac--top { bottom: calc(100% + 8px); }
  .tag-ac--bottom { top: calc(100% + 8px); }
  .tag-ac__list {
    list-style: none;
    margin: 0;
    padding: 6px;
  }
  .tag-ac__item {
    margin: 0;
  }
  .tag-ac__btn {
    display: flex;
    align-items: center;
    width: 100%;
    gap: 10px;
    padding: 12px 14px;
    min-height: var(--tn-touch-min, 44px);
    border-radius: var(--tn-radius-sm, 6px);
    color: var(--tn-fg, #c0caf5);
    text-align: left;
    background: transparent;
    border: 0;
    cursor: pointer;
  }
  .tag-ac__item--active .tag-ac__btn {
    background: var(--tn-bg-overlay, #1f2335);
  }
  .tag-ac__hash {
    color: var(--tn-accent-purple, #bb9af7);
    font-weight: 700;
  }
  .tag-ac__name {
    flex: 1;
    font-family: var(--tn-font-mono, monospace);
    font-size: 14px;
  }
  .tag-ac__count {
    color: var(--tn-fg-muted, #565f89);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
</style>
