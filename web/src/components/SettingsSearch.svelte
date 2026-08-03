<script lang="ts">
  // SPDX-License-Identifier: Apache-2.0
  /**
   * Settings search overlay (R178).
   *
   * Touch-first modal that overlays the current screen. Triggered by
   * the search button in the SettingsView header. Lives at the screen
   * level (not mounted globally) because no other view needs it — if
   * a future R-round wants a global shortcut, lift the state into a
   * store and mount this from App.svelte.
   *
   * The component is "dumb": it filters the registry, renders the
   * results, and emits `onSelect(entry)`. The caller (SettingsView)
   * decides whether to scroll, navigate, or open a URL.
   */
  import { tick } from 'svelte';
  import {
    SETTINGS_REGISTRY,
    type SettingEntry,
    type SettingCategory,
  } from '$lib/settingsRegistry';
  import { searchSettings, type MatchedEntry } from '$lib/settingsSearch';
  import { tap } from '$lib/haptics';

  interface Props {
    open: boolean;
    onClose: () => void;
    onSelect: (entry: SettingEntry) => void;
  }
  let { open, onClose, onSelect }: Props = $props();

  let query = $state('');
  let inputEl: HTMLInputElement | null = $state(null);
  let lastFocused: HTMLElement | null = null;

  const results = $derived<MatchedEntry[]>(searchSettings(query, SETTINGS_REGISTRY));

  /** Group results by category, preserving registry order within each group. */
  const grouped = $derived.by<
    Array<{ category: SettingCategory; entries: MatchedEntry[] }>
  >(() => {
    const buckets: Array<{ category: SettingCategory; entries: MatchedEntry[] }> = [];
    const seen = new Map<SettingCategory, MatchedEntry[]>();
    for (const r of results) {
      let bucket = seen.get(r.category);
      if (!bucket) {
        bucket = [];
        seen.set(r.category, bucket);
        buckets.push({ category: r.category, entries: bucket });
      }
      bucket.push(r);
    }
    return buckets;
  });

  const CATEGORY_LABEL: Record<SettingCategory, string> = {
    profile: 'Profile',
    theme: 'Theme',
    feedback: 'Feedback',
    about: 'About',
    actions: 'Actions',
  };

  const EXAMPLE_QUERIES = ['Theme', 'Haptics', 'Version', 'License', 'Reset'];

  // ── Lifecycle: focus on open, restore on close ─────────────────────
  $effect(() => {
    if (open) {
      // Capture the previously focused element so we can restore focus
      // when the dialog closes (basic focus trap — no roving tabindex,
      // but Esc + click-outside are wired up).
      lastFocused = (document.activeElement as HTMLElement | null) ?? null;
      void tick().then(() => {
        inputEl?.focus();
        inputEl?.select();
      });
    } else {
      query = '';
      lastFocused?.focus?.();
      lastFocused = null;
    }
  });

  // ── Body scroll lock while open ──────────────────────────────────
  $effect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  });

  // ── Keyboard: Escape closes ───────────────────────────────────────
  function onKeydown(e: KeyboardEvent): void {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    // Enter on the input does nothing — the user must tap a row to
    // commit a selection. (Prevents accidental jumps on autocomplete.)
  }

  // ── Backdrop click closes (but not clicks inside the panel) ───────
  function onBackdropClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) onClose();
  }

  // ── Row tap: haptic + select + close ──────────────────────────────
  async function onRowTap(entry: SettingEntry): Promise<void> {
    void tap('selection');
    onSelect(entry);
    onClose();
  }

  // Keep the global keydown handler in sync with `open`. Svelte 5
  // $effect runs whenever the dependency flips.
  $effect(() => {
    if (!open) return;
    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  });
</script>

{#if open}
  <div
    class="settings-search"
    role="dialog"
    aria-modal="true"
    aria-label="Search settings"
    data-testid="settings-search"
    onclick={onBackdropClick}
  >
    <div class="settings-search__panel" data-testid="settings-search-panel">
      <div class="settings-search__input-row">
        <svg
          class="settings-search__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input
          bind:this={inputEl}
          bind:value={query}
          type="text"
          class="settings-search__input"
          placeholder="Search settings"
          aria-label="Search settings"
          data-testid="settings-search-input"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
        />
        <button
          type="button"
          class="settings-search__close"
          aria-label="Close search"
          data-testid="settings-search-close"
          onclick={() => onClose()}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div
        class="settings-search__count"
        aria-live="polite"
        data-testid="settings-search-count"
      >
        {results.length === SETTINGS_REGISTRY.length
          ? `${results.length} settings`
          : `${results.length} match${results.length === 1 ? '' : 'es'}`}
      </div>

      <div class="settings-search__results" data-testid="settings-search-results">
        {#if results.length === 0}
          <div class="settings-search__empty" data-testid="settings-search-empty">
            <p class="settings-search__empty-title">No matches</p>
            <p class="settings-search__empty-hint">Try one of these:</p>
            <ul class="settings-search__empty-list">
              {#each EXAMPLE_QUERIES as ex (ex)}
                <li>
                  <button
                    type="button"
                    class="settings-search__chip"
                    data-testid={`settings-search-chip-${ex.toLowerCase()}`}
                    onclick={() => (query = ex)}
                  >
                    {ex}
                  </button>
                </li>
              {/each}
            </ul>
          </div>
        {:else}
          {#each grouped as group (group.category)}
            <section class="settings-search__group" data-category={group.category}>
              <h3 class="settings-search__group-title">{CATEGORY_LABEL[group.category]}</h3>
              <ul class="settings-search__list">
                {#each group.entries as entry (entry.id)}
                  <li>
                    <button
                      type="button"
                      class="settings-search__row"
                      data-testid={`settings-search-row-${entry.id}`}
                      onclick={() => void onRowTap(entry)}
                    >
                      <span class="settings-search__row-title">{entry.title}</span>
                      <span class="settings-search__row-badge" data-field={entry.matchedField}>
                        {entry.matchedField === 'title' ? 'title' : 'keyword'}
                      </span>
                    </button>
                  </li>
                {/each}
              </ul>
            </section>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .settings-search {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: max(env(safe-area-inset-top), 24px) 16px 24px;
  }

  .settings-search__panel {
    width: 100%;
    max-width: 560px;
    max-height: calc(100dvh - 48px);
    display: flex;
    flex-direction: column;
    background: var(--tn-bg-elevated);
    border: 1px solid var(--tn-border);
    border-radius: var(--tn-radius-lg);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }

  .settings-search__input-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--tn-border);
    background: var(--tn-bg);
  }

  .settings-search__icon {
    flex: 0 0 20px;
    width: 20px;
    height: 20px;
    color: var(--tn-fg-dim);
  }

  .settings-search__input {
    flex: 1;
    min-width: 0;
    min-height: var(--tn-touch-pref);
    padding: 8px 0;
    font-size: 16px;
    background: transparent;
    border: 0;
    color: var(--tn-fg);
  }

  .settings-search__input:focus {
    outline: none;
  }

  .settings-search__close {
    flex: 0 0 var(--tn-touch-pref);
    width: var(--tn-touch-pref);
    height: var(--tn-touch-pref);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--tn-radius-sm);
    color: var(--tn-fg-dim);
  }
  .settings-search__close:hover,
  .settings-search__close:focus-visible {
    color: var(--tn-fg);
    background: var(--tn-bg-elevated);
  }
  .settings-search__close svg {
    width: 20px;
    height: 20px;
  }

  .settings-search__count {
    padding: 8px 16px;
    font-size: 13px;
    color: var(--tn-fg-muted);
    border-bottom: 1px solid var(--tn-border);
  }

  .settings-search__results {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .settings-search__group {
    padding: 8px 0;
  }
  .settings-search__group + .settings-search__group {
    border-top: 1px solid var(--tn-border);
  }

  .settings-search__group-title {
    margin: 0;
    padding: 8px 16px 4px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--tn-fg-muted);
  }

  .settings-search__list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .settings-search__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    min-height: 56px;
    padding: 12px 16px;
    text-align: left;
    background: transparent;
    border: 0;
    color: var(--tn-fg);
    font-size: 16px;
  }
  .settings-search__row:hover {
    background: var(--tn-bg-overlay);
  }
  .settings-search__row:focus-visible {
    outline: 2px solid var(--tn-accent-blue);
    outline-offset: -2px;
  }

  .settings-search__row-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .settings-search__row-badge {
    flex: 0 0 auto;
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 8px;
    border-radius: var(--tn-radius-sm);
    color: var(--tn-fg-dim);
    background: var(--tn-bg);
    border: 1px solid var(--tn-border);
  }
  .settings-search__row-badge[data-field='title'] {
    color: var(--tn-accent-blue);
    border-color: var(--tn-accent-blue);
  }
  .settings-search__row-badge[data-field='keyword'] {
    color: var(--tn-fg-muted);
  }

  .settings-search__empty {
    padding: 32px 16px;
    text-align: center;
    color: var(--tn-fg-dim);
  }
  .settings-search__empty-title {
    margin: 0 0 8px;
    font-size: 18px;
    color: var(--tn-fg);
  }
  .settings-search__empty-hint {
    margin: 0 0 12px;
    font-size: 14px;
    color: var(--tn-fg-muted);
  }
  .settings-search__empty-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
  }
  .settings-search__chip {
    min-height: 44px;
    padding: 8px 14px;
    font-size: 14px;
    color: var(--tn-fg);
    background: var(--tn-bg);
    border: 1px solid var(--tn-border);
    border-radius: var(--tn-radius-sm);
  }
  .settings-search__chip:hover,
  .settings-search__chip:focus-visible {
    border-color: var(--tn-accent-blue);
    color: var(--tn-accent-blue);
  }
</style>
