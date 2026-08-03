<script lang="ts">
  import { render as renderMarkdown } from '$lib/markdown';
  import type { Note } from '$lib/notesBacklinks';

  interface Props {
    source: string;
    notes?: Note[];
    onWikilinkClick?: (target: string, exists: boolean) => void;
    ariaLabel?: string;
  }

  let { source, notes = [], onWikilinkClick, ariaLabel = 'Rendered preview' }: Props = $props();

  // R136 — hand-rolled markdown parser with wikilink resolution. Returns
  // sanitized HTML (safe for `{@html}`) plus a list of wikilink targets
  // and whether each one exists in the notes store.
  const result = $derived(renderMarkdown(source ?? '', notes ?? []));

  // R136 — delegate clicks on `.wikilink` anchors to a parent callback.
  // The parent decides whether to navigate (existing) or create a stub
  // (broken). We use a Svelte action so the listener attaches after the
  // `{@html}` content is in the DOM.
  function wikilinkClickAction(node: HTMLElement): { destroy: () => void } {
    function onClick(e: MouseEvent): void {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const anchor = target.closest('a.wikilink') as HTMLAnchorElement | null;
      if (!anchor) return;
      e.preventDefault();
      const title = anchor.getAttribute('data-title');
      if (!title) return;
      const exists = !anchor.classList.contains('wikilink--broken');
      onWikilinkClick?.(title, exists);
    }
    function onKeydown(e: KeyboardEvent): void {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const anchor = target.closest('a.wikilink') as HTMLAnchorElement | null;
      if (!anchor) return;
      e.preventDefault();
      const title = anchor.getAttribute('data-title');
      if (!title) return;
      const exists = !anchor.classList.contains('wikilink--broken');
      onWikilinkClick?.(title, exists);
    }
    node.addEventListener('click', onClick);
    node.addEventListener('keydown', onKeydown);
    return {
      destroy(): void {
        node.removeEventListener('click', onClick);
        node.removeEventListener('keydown', onKeydown);
      },
    };
  }
</script>

<div
  class="md-preview"
  data-testid="markdown-preview"
  role="article"
  aria-label={ariaLabel}
  aria-live="polite"
  use:wikilinkClickAction
>
  {@html result.html}
</div>

<style>
  .md-preview {
    color: var(--tn-fg, #c0caf5);
    line-height: 1.6;
    word-wrap: break-word;
    font-size: var(--tn-font-body, 16px);
  }
  .md-preview :global(h1) {
    font-size: 28px;
    margin: 16px 0 8px;
  }
  .md-preview :global(h2) {
    font-size: 22px;
    margin: 14px 0 6px;
  }
  .md-preview :global(h3) {
    font-size: 18px;
    margin: 12px 0 6px;
  }
  .md-preview :global(p) { margin: 8px 0; }
  .md-preview :global(code) {
    font-family: var(--tn-font-mono, monospace);
    background: var(--tn-bg-elevated, #24283b);
    border: 1px solid var(--tn-border, #414868);
    border-radius: 6px;
    padding: 1px 6px;
    font-size: 0.9em;
  }
  .md-preview :global(pre) {
    font-family: var(--tn-font-mono, monospace);
    background: var(--tn-bg-elevated, #24283b);
    border: 1px solid var(--tn-border, #414868);
    border-radius: 12px;
    padding: 12px 16px;
    overflow-x: auto;
    font-size: 15px;
  }
  .md-preview :global(pre code) {
    background: transparent;
    border: 0;
    padding: 0;
  }
  /* R136 — existing wikilinks: Tokyo Night blue accent, no underline by
     default (the box itself signals interactivity). */
  .md-preview :global(.wikilink) {
    color: var(--tn-accent-blue, #7aa2f7);
    background: rgba(122, 162, 247, 0.08);
    border: 1px solid rgba(122, 162, 247, 0.25);
    border-radius: 6px;
    padding: 1px 6px;
    text-decoration: none;
    cursor: pointer;
    transition: background-color 0.15s, border-color 0.15s;
  }
  .md-preview :global(.wikilink:hover) {
    background: rgba(122, 162, 247, 0.16);
    border-color: rgba(122, 162, 247, 0.5);
  }
  /* R136 — broken wikilinks: red dashed underline, "create on tap" affordance. */
  .md-preview :global(.wikilink--broken) {
    color: var(--tn-error, #f7768e);
    background: rgba(247, 118, 142, 0.06);
    border: 1px dashed rgba(247, 118, 142, 0.4);
    border-radius: 6px;
    padding: 1px 6px;
    text-decoration: none;
    cursor: pointer;
    transition: background-color 0.15s, border-color 0.15s;
  }
  .md-preview :global(.wikilink--broken:hover) {
    background: rgba(247, 118, 142, 0.14);
    border-color: rgba(247, 118, 142, 0.7);
  }
  .md-preview :global(blockquote) {
    border-left: 3px solid var(--tn-accent-purple, #bb9af7);
    padding: 4px 12px;
    color: var(--tn-fg-dim, #9aa5ce);
    margin: 12px 0;
  }
  .md-preview :global(ul),
  .md-preview :global(ol) { padding-left: 24px; }
  /* R146 — GFM tables. Tokyo Night palette, no hardcoded hex (fallbacks
     are only for non-app.css contexts like Storybook). Header row uses
     --tn-bg-elevated for surface; body uses --tn-fg-dim. Alignment is
     driven by `.align-left` / `.align-center` / `.align-right` classes
     that the parser sets on each <th> and <td>. */
  .md-preview :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin: var(--tn-sp-3, 12px) 0;
    font-size: var(--tn-font-body, 16px);
  }
  .md-preview :global(th),
  .md-preview :global(td) {
    padding: var(--tn-sp-2, 8px) var(--tn-sp-3, 12px);
    border-bottom: 1px solid var(--tn-border, #414868);
    text-align: left;
    vertical-align: top;
  }
  .md-preview :global(th) {
    color: var(--tn-fg, #c0caf5);
    font-weight: 600;
    background: var(--tn-bg-elevated, #24283b);
  }
  .md-preview :global(td) {
    color: var(--tn-fg-dim, #9aa5ce);
  }
  .md-preview :global(.align-left) { text-align: left; }
  .md-preview :global(.align-center) { text-align: center; }
  .md-preview :global(.align-right) { text-align: right; }
</style>
