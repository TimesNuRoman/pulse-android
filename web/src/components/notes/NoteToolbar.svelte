<script lang="ts">
  import { hapticImpact } from '$lib/capacitor';
  import { notesStore } from '$lib/notesStore';
  import { isAvailable, start as startRecognition, stop as stopRecognition } from '$lib/voice/recognition';

  export type ToolbarAction =
    | 'bold'
    | 'italic'
    | 'code'
    | 'link'
    | 'list'
    | 'heading'
    | 'image';

  interface Props {
    onAction: (action: ToolbarAction) => void;
    disabled?: boolean;
    compact?: boolean;
    activeNoteId?: string | null;
  }

  let { onAction, disabled = false, compact = false, activeNoteId = null }: Props = $props();

  interface ToolDef {
    id: ToolbarAction;
    label: string;
    ariaLabel: string;
    icon: string; // SVG path
    hotkey: string;
  }

  const tools: ToolDef[] = [
    {
      id: 'bold',
      label: 'B',
      ariaLabel: 'Bold (Ctrl+B)',
      hotkey: 'Ctrl+B',
      icon: 'M6 4h6.5a4 4 0 0 1 0 8H6V4zm0 8h7a4 4 0 0 1 0 8H6v-8z',
    },
    {
      id: 'italic',
      label: 'I',
      ariaLabel: 'Italic (Ctrl+I)',
      hotkey: 'Ctrl+I',
      icon: 'M10 4h4l-2 16h-4l2-16z',
    },
    {
      id: 'code',
      label: '</>',
      ariaLabel: 'Inline code (Ctrl+E)',
      hotkey: 'Ctrl+E',
      icon: 'M9 6l-5 6 5 6M15 6l5 6-5 6',
    },
    {
      id: 'link',
      label: 'Link',
      ariaLabel: 'Insert link (Ctrl+K)',
      hotkey: 'Ctrl+K',
      icon: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
    },
    {
      id: 'list',
      label: 'List',
      ariaLabel: 'Bullet list',
      hotkey: '',
      icon: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
    },
    {
      id: 'heading',
      label: 'H',
      ariaLabel: 'Heading (cycle h1/h2/h3)',
      hotkey: '',
      icon: 'M6 4v16M18 4v16M6 12h12',
    },
    {
      id: 'image',
      label: 'Image',
      ariaLabel: 'Insert image',
      hotkey: '',
      icon: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5zM8 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM21 15l-5-5L5 21',
    },
  ];

  let headingLevel = $state(1);

  // Voice capture state. 'idle' is the default, 'listening' means the mic
  // is actively recording, 'error' is a brief fallback when the plugin
  // reports unavailable.
  let voiceState: 'idle' | 'listening' | 'error' = $state('idle');
  let lastPartial: string = $state('');

  function handle(action: ToolbarAction): void {
    if (disabled) return;
    if (action === 'heading') {
      headingLevel = (headingLevel % 3) + 1;
    }
    void hapticImpact({ light: true });
    onAction?.(action);
  }

  async function toggleVoice(): Promise<void> {
    if (disabled) return;
    void hapticImpact({ light: true });

    if (voiceState === 'listening') {
      // User taps again to stop — append the latest partial to the active note.
      await stopRecognition();
      if (activeNoteId && lastPartial.trim().length > 0) {
        const note = notesStore.get(activeNoteId);
        if (note) {
          const sep = note.content.length > 0 && !note.content.endsWith('\n') ? '\n' : '';
          notesStore.update(activeNoteId, {
            content: `${note.content}${sep}${lastPartial.trim()}`,
          });
        }
      }
      lastPartial = '';
      voiceState = 'idle';
      return;
    }

    if (!(await isAvailable())) {
      voiceState = 'error';
      setTimeout(() => {
        if (voiceState === 'error') voiceState = 'idle';
      }, 1500);
      return;
    }

    lastPartial = '';
    voiceState = 'listening';
    await startRecognition(
      (result) => {
        lastPartial = result.text;
      },
      (err) => {
        console.warn('[NoteToolbar] speech recognition error', err);
        voiceState = 'error';
        setTimeout(() => {
          if (voiceState === 'error') voiceState = 'idle';
        }, 1500);
      },
    );
  }

  // Expose current heading level for the parent (via prop callback).
  export function getHeadingLevel(): number {
    return headingLevel;
  }
</script>

<nav
  class="md-toolbar"
  class:md-toolbar--compact={compact}
  class:md-toolbar--disabled={disabled}
  data-testid="note-toolbar"
  role="toolbar"
  aria-label="Markdown formatting"
  aria-disabled={disabled}
>
  {#each tools as tool (tool.id)}
    <button
      type="button"
      class="md-toolbar__btn"
      aria-label={tool.ariaLabel}
      title={tool.ariaLabel}
      data-testid={`toolbar-${tool.id}`}
      data-action={tool.id}
      {disabled}
      onclick={() => handle(tool.id)}
    >
      <svg
        class="md-toolbar__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d={tool.icon} />
      </svg>
      {#if !compact}
        <span class="md-toolbar__label">{tool.label}</span>
      {/if}
    </button>
  {/each}
  <span class="md-toolbar__separator" aria-hidden="true"></span>
  <button
    type="button"
    class="md-toolbar__btn md-toolbar__btn--voice"
    class:md-toolbar__btn--listening={voiceState === 'listening'}
    class:md-toolbar__btn--error={voiceState === 'error'}
    aria-label="Voice input"
    aria-pressed={voiceState === 'listening'}
    title="Voice input"
    data-testid="toolbar-voice"
    data-action="voice"
    data-voice-state={voiceState}
    {disabled}
    onclick={() => void toggleVoice()}
  >
    <svg
      class="md-toolbar__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v4" />
      <path d="M8 23h8" />
    </svg>
    {#if !compact}
      <span class="md-toolbar__label">Voice</span>
    {/if}
  </button>
</nav>

<style>
  .md-toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 8px;
    background: var(--tn-bg-elevated, #24283b);
    border: 1px solid var(--tn-border, #414868);
    border-radius: var(--tn-radius-md, 12px);
    overflow-x: auto;
    scrollbar-width: thin;
  }
  .md-toolbar__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: var(--tn-touch-min, 44px);
    min-height: var(--tn-touch-min, 44px);
    padding: 0 10px;
    border-radius: var(--tn-radius-sm, 6px);
    color: var(--tn-fg-dim, #9aa5ce);
    background: transparent;
    border: 1px solid transparent;
    transition: background-color 0.15s, color 0.15s, border-color 0.15s;
    flex-shrink: 0;
  }
  .md-toolbar__btn:hover:not(:disabled) {
    background: var(--tn-bg-overlay, #1f2335);
    color: var(--tn-fg, #c0caf5);
  }
  .md-toolbar__btn:active:not(:disabled) {
    background: var(--tn-bg, #1a1b26);
    border-color: var(--tn-accent-blue, #7aa2f7);
  }
  .md-toolbar__btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .md-toolbar__icon {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }
  .md-toolbar__label {
    font-size: 13px;
    font-weight: 600;
  }
  .md-toolbar--compact .md-toolbar__btn {
    min-width: var(--tn-touch-min, 44px);
    padding: 0;
  }
  .md-toolbar__separator {
    width: 1px;
    align-self: stretch;
    margin: 6px 4px;
    background: var(--tn-border, #414868);
    flex-shrink: 0;
  }
  .md-toolbar__btn--listening {
    background: var(--tn-bg-overlay, #1f2335);
    color: var(--tn-accent-blue, #7aa2f7);
    border-color: var(--tn-accent-blue, #7aa2f7);
  }
  .md-toolbar__btn--error {
    color: var(--tn-error, #f7768e);
    border-color: var(--tn-error, #f7768e);
  }
  .md-toolbar--disabled {
    opacity: 0.5;
  }
</style>
