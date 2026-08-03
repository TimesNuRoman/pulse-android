<script lang="ts">
  /**
   * Notes search bar (R193).
   *
   * Inline bar at the top of the notes list. Not a popover, not a modal.
   * Two-way binds `query` to the parent (which runs the actual search via
   * `searchNotes()`). Debounces 150ms so each keystroke doesn't fire the
   * ranking + DOM update — the user feels the input is instant, the list
   * settles 150ms after they stop typing.
   *
   * Display: input + clear button + result count line. The count text
   * ("No results" / "1 result" / "12 results" / "Showing all 47") is
   * derived from `filteredCount` and `totalCount` — the parent owns the
   * search, this component is purely a view + input.
   */

  interface Props {
    /** Two-way bound search query. Parent writes → input syncs; user
     *  types → debounced 150ms write back to parent. */
    query: string;
    /** Result count after applying `query` (the parent computes this). */
    filteredCount: number;
    /** Total notes (used when no query is active — "Showing all 47"). */
    totalCount: number;
  }

  let { query = $bindable(''), filteredCount, totalCount }: Props = $props();

  // Local mirror of `query` so the input is instant; the parent's
  // debounced binding propagates back via the `$effect` below.
  let localQuery = $state(query);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // External change (e.g. parent clear) → sync local mirror.
  $effect(() => {
    // Read `query` so this effect re-runs on external changes.
    const q = query;
    if (debounceTimer === null && localQuery !== q) {
      localQuery = q;
    }
  });

  function scheduleSync(value: string): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (query !== value) query = value;
    }, 150);
  }

  function onInput(e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    localQuery = v;
    scheduleSync(v);
  }

  function clearQuery(): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    localQuery = '';
    query = '';
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' && localQuery.length > 0) {
      e.preventDefault();
      clearQuery();
    }
  }

  const countText = $derived.by((): string => {
    if (!query) return `Showing all ${totalCount}`;
    if (filteredCount === 0) return 'No results';
    if (filteredCount === 1) return '1 result';
    return `${filteredCount} results`;
  });

  const hasQuery = $derived(localQuery.length > 0);
</script>

<form
  class="notes-search"
  role="search"
  aria-label="Search notes"
  onsubmit={(e) => e.preventDefault()}
>
  <div class="notes-search__bar">
    <svg
      class="notes-search__icon"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
    <input
      type="search"
      class="notes-search__input"
      placeholder="Search notes…"
      aria-label="Search notes"
      autocomplete="off"
      autocorrect="off"
      spellcheck="false"
      value={localQuery}
      oninput={onInput}
      onkeydown={onKey}
      data-testid="notes-search-input"
    />
    {#if hasQuery}
      <button
        type="button"
        class="notes-search__clear"
        onclick={clearQuery}
        aria-label="Clear search"
        data-testid="notes-search-clear"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    {/if}
  </div>
  <div
    class="notes-search__count"
    data-testid="notes-search-count"
    aria-live="polite"
  >
    {countText}
  </div>
</form>

<style>
  .notes-search {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--tn-border, #414868);
    background: var(--tn-bg-elevated, #24283b);
  }
  .notes-search__bar {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--tn-bg, #1a1b26);
    border: 1px solid var(--tn-border, #414868);
    border-radius: 10px;
    padding: 0 12px;
    min-height: 56px; /* M3 preferred (R95b) — 56dp > 44dp */
    transition: border-color 0.15s;
  }
  .notes-search__bar:focus-within {
    border-color: var(--tn-accent-blue, #7aa2f7);
  }
  .notes-search__icon {
    flex: 0 0 auto;
    color: var(--tn-fg-muted, #565f89);
  }
  .notes-search__input {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 56px; /* M3 preferred */
    background: transparent;
    border: 0;
    outline: 0;
    color: var(--tn-fg, #c0caf5);
    font-size: 16px; /* ≥16px prevents iOS zoom on focus */
    padding: 0;
  }
  .notes-search__input::placeholder {
    color: var(--tn-fg-muted, #565f89);
  }
  .notes-search__input::-webkit-search-cancel-button {
    display: none; /* we use our own clear button */
  }
  .notes-search__clear {
    flex: 0 0 auto;
    min-width: 44px;
    min-height: 44px;
    background: transparent;
    border: 0;
    color: var(--tn-fg-dim, #9aa5ce);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    padding: 0;
  }
  .notes-search__clear:hover {
    color: var(--tn-fg, #c0caf5);
    background: var(--tn-bg-overlay, #1f2335);
  }
  .notes-search__count {
    font-size: 12px;
    color: var(--tn-fg-muted, #565f89);
    padding: 2px 4px 0;
    min-height: 16px; /* prevent layout shift when text changes */
  }

  @media (prefers-reduced-motion: reduce) {
    .notes-search__bar {
      transition: none;
    }
  }
</style>
