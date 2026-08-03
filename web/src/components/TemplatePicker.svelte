<script lang="ts">
  // SPDX-License-Identifier: Apache-2.0
  /**
   * R190 — Note template picker popover.
   *
   * Anchored popover (not a full-screen modal) that lists the available
   * note templates. Caller provides an `open` flag, an `anchor` element
   * to position against, and `onpick` / `ondismiss` callbacks.
   *
   * - role="listbox" root, role="option" per row, aria-selected active row
   * - 56dp min-height per row (brief hard rule 11)
   * - Up/Down/Home/End keyboard nav, Enter selects, Escape closes
   * - outside-click closes, focus returns to the trigger
   * - tap('selection') on pick (R118 haptic API)
   * - prefers-reduced-motion: no slide animation
   */
  import { onDestroy, tick } from 'svelte';
  import { tap } from '$lib/haptics';
  import { getAllTemplates, type NoteTemplate } from '$lib/noteTemplates';

  interface Props {
    open: boolean;
    /** Element the popover anchors to; focus is restored here on close. */
    trigger?: HTMLElement | null;
    onpick: (template: NoteTemplate) => void;
    ondismiss: () => void;
  }

  let { open, trigger = null, onpick, ondismiss }: Props = $props();

  const templates = getAllTemplates();
  let activeIndex = $state(0);
  let rootEl: HTMLDivElement | undefined = $state();

  // Reset the active row every time the popover opens.
  $effect(() => {
    if (open) {
      activeIndex = 0;
    }
  });

  function onKey(e: KeyboardEvent): void {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      dismiss();
      return;
    }
    if (templates.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % templates.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + templates.length) % templates.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      activeIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      activeIndex = templates.length - 1;
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const choice = templates[activeIndex];
      if (choice) pick(choice);
    }
  }

  function pick(t: NoteTemplate): void {
    void tap('selection');
    onpick(t);
  }

  function dismiss(): void {
    // Restore focus to the trigger when the popover closes (a11y brief).
    if (trigger) {
      // Defer to next tick so Svelte's {#if open} unmount doesn't steal focus.
      tick().then(() => {
        trigger?.focus();
      });
    }
    ondismiss();
  }

  function onWindowPointer(e: PointerEvent): void {
    if (!open) return;
    const target = e.target as Node | null;
    if (!target) return;
    if (rootEl && rootEl.contains(target)) return;
    if (trigger && trigger.contains(target)) return;
    ondismiss();
  }

  $effect(() => {
    if (!open) return;
    window.addEventListener('keydown', onKey, true);
    // pointerdown fires before blur, so the popover is closed cleanly when
    // the user taps outside (including tapping the trigger again).
    window.addEventListener('pointerdown', onWindowPointer, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onWindowPointer, true);
    };
  });

  onDestroy(() => {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('pointerdown', onWindowPointer, true);
  });
</script>

{#if open}
  <div
    bind:this={rootEl}
    class="templates"
    role="listbox"
    tabindex={-1}
    aria-label="Note templates"
    aria-activedescendant={`template-option-${templates[activeIndex]?.id ?? ''}`}
    data-testid="template-picker"
  >
    {#each templates as t, i (t.id)}
      <button
        type="button"
        id={`template-option-${t.id}`}
        class="templates__row"
        class:templates__row--active={i === activeIndex}
        role="option"
        aria-selected={i === activeIndex}
        data-testid={`template-option-${t.id}`}
        data-template-id={t.id}
        onclick={() => pick(t)}
        onmouseenter={() => (activeIndex = i)}
        onfocus={() => (activeIndex = i)}
      >
        <span class="templates__icon" aria-hidden="true">
          {#if t.icon === 'meeting'}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          {:else if t.icon === 'todo'}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          {:else if t.icon === 'journal'}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              <line x1="8" y1="7" x2="16" y2="7" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          {:else if t.icon === 'code'}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          {:else if t.icon === 'reading'}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
          {/if}
        </span>
        <span class="templates__text">
          <span class="templates__name">{t.name}</span>
          <span class="templates__desc">{t.description}</span>
        </span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .templates {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 60;
    min-width: 220px;
    max-width: 360px;
    background: var(--tn-bg-elevated, #24283b);
    border: 1px solid var(--tn-border, #414868);
    border-radius: var(--tn-radius-md, 12px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    padding: 6px;
    display: grid;
    grid-template-columns: 1fr;
    gap: 2px;
    animation: templates-in 120ms ease-out;
  }
  /* 5-column gallery on wide screens (brief: "5 columns layout for icons"). */
  @media (min-width: 720px) {
    .templates {
      min-width: 520px;
      grid-template-columns: repeat(5, 1fr);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .templates {
      animation: none;
    }
  }
  @keyframes templates-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .templates__row {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    width: 100%;
    min-height: 56px; /* brief: 56dp min touch */
    padding: 10px 12px;
    background: transparent;
    color: var(--tn-fg, #c0caf5);
    border: 0;
    border-radius: var(--tn-radius-sm, 6px);
    cursor: pointer;
    text-align: left;
    font: inherit;
  }
  @media (min-width: 720px) {
    .templates__row {
      align-items: center;
      padding: 12px 8px;
    }
  }
  .templates__row--active {
    background: var(--tn-bg-overlay, #1f2335);
  }
  .templates__row:focus-visible {
    outline: 2px solid var(--tn-accent-blue, #7aa2f7);
    outline-offset: 1px;
  }
  .templates__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--tn-accent-blue, #7aa2f7);
  }
  .templates__text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .templates__name {
    font-size: 14px;
    font-weight: 600;
  }
  .templates__desc {
    font-size: 12px;
    color: var(--tn-fg-muted, #565f89);
  }
</style>
