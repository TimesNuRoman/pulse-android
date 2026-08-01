<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  type Mode = 'source' | 'preview' | 'split';

  interface Props {
    value: string;
    onChange?: (s: string) => void;
    placeholder?: string;
    maxLength?: number;
    mode?: Mode;
    ariaLabel?: string;
  }

  let {
    value = $bindable(''),
    onChange,
    placeholder = 'Start writing in markdown…',
    maxLength,
    mode = 'source',
    ariaLabel = 'Markdown editor',
  }: Props = $props();

  let editorEl: HTMLDivElement | undefined = $state();
  let view: unknown = null;
  let ready = $state(false);
  let lastExternalValue: string = value;

  // Lazy import of CodeMirror — keeps the initial bundle small.
  // Components that don't render MarkdownEditor don't pay for CodeMirror.
  onMount(async () => {
    if (mode === 'preview') return;
    try {
      const [{ EditorView, basicSetup }, { EditorState }, { markdown }, { oneDark }] = await Promise.all([
        import('codemirror'),
        import('@codemirror/state'),
        import('@codemirror/lang-markdown'),
        import('@codemirror/theme-one-dark'),
      ]);

      const touchTheme = EditorView.theme({
        '&': { fontSize: '16px' },
        '.cm-content': {
          fontFamily: 'var(--tn-font-mono, monospace)',
          padding: '12px 16px',
          minHeight: '200px',
          caretColor: 'var(--tn-accent-blue, #7aa2f7)',
        },
        '.cm-line': { padding: '0 4px', lineHeight: '1.6' },
        '.cm-scroller': { fontFamily: 'inherit' },
        '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--tn-accent-blue, #7aa2f7)' },
        '.cm-gutters': {
          backgroundColor: 'var(--tn-bg-elevated, #24283b)',
          color: 'var(--tn-fg-muted, #565f89)',
          border: 'none',
        },
        '.cm-activeLine': { backgroundColor: 'transparent' },
        '.cm-activeLineGutter': { backgroundColor: 'transparent' },
      });

      const state = EditorState.create({
        doc: value ?? '',
        extensions: [
          basicSetup,
          markdown(),
          oneDark,
          touchTheme,
          EditorView.lineWrapping,
          EditorView.updateListener.of((u: { docChanged: boolean; state: { doc: { toString: () => string } } }) => {
            if (u.docChanged) {
              const text = u.state.doc.toString();
              if (maxLength != null && text.length > maxLength) return;
              lastExternalValue = text;
              onChange?.(text);
            }
          }),
        ],
      });

      view = new EditorView({ state, parent: editorEl });
      ready = true;
    } catch (err) {
      // CodeMirror not available (e.g. test env). Component still renders the wrapper.
      console.warn('[MarkdownEditor] CodeMirror failed to load', err);
    }
  });

  // Sync external value -> editor when parent value changes and the editor is ready.
  $effect(() => {
    const v = value;
    if (!ready || !view) return;
    type View = { state: { doc: { toString: () => string } }; dispatch: (tr: unknown) => void };
    const vw = view as View;
    if (v !== vw.state.doc.toString() && v !== lastExternalValue) {
      // External change — replace the doc.
      // We import dynamically to avoid SSR / test issues.
      import('@codemirror/state').then(({ Text }: { Text: { of: (s: string) => unknown } }) => {
        // Use EditorView's dispatch via a simple replace transaction.
        type ViewDispatch = { state: { doc: { length: number } }; dispatch: (tr: unknown) => void };
        const v2 = view as ViewDispatch;
        // dynamic transaction builder
        type Repl = { replaceRangeFrom: number; replaceRangeTo: number; insert: string };
        const txCtor = (v2 as unknown as { state: { update: (cb: (tr: unknown) => unknown) => unknown } }).state;
        void txCtor;
        v2.dispatch({ changes: { from: 0, to: v2.state.doc.length, insert: v } });
      }).catch(() => {});
    }
  });

  onDestroy(() => {
    type Destroyable = { destroy: () => void };
    (view as Destroyable | null)?.destroy?.();
    view = null;
  });

  const showSource = $derived(mode === 'source' || mode === 'split');
  const showPreview = $derived(mode === 'preview' || mode === 'split');
</script>

<div class="md-editor" data-testid="markdown-editor" data-mode={mode} data-ready={ready}>
  {#if showSource}
    <div
      class="md-editor__source"
      bind:this={editorEl}
      role="textbox"
      aria-multiline="true"
      aria-label={ariaLabel}
      aria-readonly="false"
      data-placeholder={placeholder}
    ></div>
  {/if}
  {#if !ready && showSource}
    <div class="md-editor__loading" aria-hidden="true">Loading editor…</div>
  {/if}
  {#if showPreview}
    <div class="md-editor__preview" data-testid="markdown-preview-slot">
      <slot name="preview" />
    </div>
  {/if}
</div>

<style>
  .md-editor {
    display: flex;
    flex-direction: column;
    min-height: 0;
    width: 100%;
    height: 100%;
    background: var(--tn-bg, #1a1b26);
    border: 1px solid var(--tn-border, #414868);
    border-radius: var(--tn-radius-md, 12px);
    overflow: hidden;
  }
  .md-editor[data-mode='split'] {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .md-editor__source {
    min-height: 200px;
    overflow: auto;
    background: var(--tn-bg, #1a1b26);
  }
  .md-editor__preview {
    border-left: 1px solid var(--tn-border, #414868);
    padding: 12px 16px;
    overflow: auto;
    background: var(--tn-bg, #1a1b26);
  }
  .md-editor__loading {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--tn-fg-muted, #565f89);
    font-size: var(--tn-font-small, 13px);
  }
  @media (max-width: 767px) {
    .md-editor[data-mode='split'] { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr; }
    .md-editor__preview { border-left: 0; border-top: 1px solid var(--tn-border, #414868); }
  }
</style>
