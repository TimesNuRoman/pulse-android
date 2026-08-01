<script lang="ts">
  import { renderMarkdown } from '$lib/markdownIt';

  interface Props {
    source: string;
    ariaLabel?: string;
  }

  let { source, ariaLabel = 'Rendered preview' }: Props = $props();

  const html = $derived(renderMarkdown(source ?? ''));
</script>

<div
  class="md-preview"
  data-testid="markdown-preview"
  role="article"
  aria-label={ariaLabel}
  aria-live="polite"
>
  {@html html}
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
  .md-preview :global(.wikilink) {
    color: var(--tn-accent-cyan, #7dcfff);
    background: rgba(125, 207, 255, 0.08);
    border: 1px solid rgba(125, 207, 255, 0.25);
    border-radius: 6px;
    padding: 1px 6px;
    text-decoration: none;
  }
  .md-preview :global(.tag) {
    color: var(--tn-accent-purple, #bb9af7);
    background: rgba(187, 154, 247, 0.08);
    border: 1px solid rgba(187, 154, 247, 0.25);
    border-radius: 6px;
    padding: 1px 6px;
    text-decoration: none;
    font-size: 0.9em;
  }
  .md-preview :global(blockquote) {
    border-left: 3px solid var(--tn-accent-purple, #bb9af7);
    padding: 4px 12px;
    color: var(--tn-fg-dim, #9aa5ce);
    margin: 12px 0;
  }
  .md-preview :global(ul),
  .md-preview :global(ol) { padding-left: 24px; }
</style>
