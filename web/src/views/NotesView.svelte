<script lang="ts">
  import MarkdownEditor from '../components/notes/MarkdownEditor.svelte';
  import MarkdownPreview from '../components/notes/MarkdownPreview.svelte';
  import NoteToolbar, { type ToolbarAction } from '../components/notes/NoteToolbar.svelte';
  import TagAutocomplete from '../components/notes/TagAutocomplete.svelte';
  import SplitPane from '../components/notes/SplitPane.svelte';
  import SettingsView from './SettingsView.svelte';
  import { notesStore, sortedNotes, allTags, backlinkIndex } from '../lib/notesStore';
  import { extractBacklinks, extractTags, type Note } from '../lib/notesBacklinks';
  import { share, copyToClipboard, hapticImpact } from '../lib/capacitor';
  import { tap } from '../lib/haptics';

  type Mode = 'source' | 'preview' | 'split';
  type View = 'list' | 'note';

  interface Props {
    onReplayOnboarding?: () => void;
  }
  let { onReplayOnboarding }: Props = $props();

  let view: View = $state('list');
  let settingsOpen: boolean = $state(false);
  let activeNoteId: string | null = $state(null);
  let mode: Mode = $state('split');
  let saveState: 'idle' | 'saving' | 'saved' = $state('idle');
  let titleInput: HTMLInputElement | undefined = $state();
  let showBacklinks: boolean = $state(false);

  // Tag autocomplete state
  let tagPopupOpen: boolean = $state(false);
  let tagQuery: string = $state('');
  let tagAnchor: 'top' | 'bottom' = $state('top');

  function openSettings(): void {
    // R118 — tab switch (Settings/Notes) is a `selection` tick.
    void tap('selection');
    settingsOpen = true;
  }
  function closeSettings(): void {
    // R118 — closing Settings back to the Notes tab is also a tab switch.
    void tap('selection');
    settingsOpen = false;
  }
  function replayOnboarding(): void {
    settingsOpen = false;
    onReplayOnboarding?.();
  }

  // Derived
  const activeNote: Note | undefined = $derived(
    activeNoteId ? $notesStore.find((n) => n.id === activeNoteId) : undefined,
  );
  const notes = $derived($sortedNotes);
  const tags = $derived($allTags);
  const backlinksTo = $derived.by((): Note[] => {
    if (!activeNote) return [];
    return $backlinkIndex.get(activeNote.title.toLowerCase()) ?? [];
  });
  const noteTags = $derived(activeNote ? extractTags(activeNote.content) : []);

  function openNote(id: string): void {
    activeNoteId = id;
    view = 'note';
    saveState = 'idle';
    void hapticImpact({ light: true });
  }

  function createNote(): void {
    const note = notesStore.create('# New note\n\nStart writing…');
    openNote(note.id);
  }

  function deleteCurrentNote(): void {
    if (!activeNoteId) return;
    // R118 — note delete fires a `medium` tap. The delete button still
    // confirms immediately (single click) — see R118 report for the
    // long-press confirm follow-up.
    void tap('medium');
    notesStore.delete(activeNoteId);
    activeNoteId = null;
    view = 'list';
  }

  // R118 — debounce save haptics so the user feels one `light` tap per
  // "save burst" (after they pause typing), not one per keystroke.
  let lastSaveHapticAt = 0;
  function onContentChange(s: string): void {
    if (!activeNoteId) return;
    saveState = 'saving';
    notesStore.update(activeNoteId, { content: s });
    saveState = 'saved';
    const now = Date.now();
    if (now - lastSaveHapticAt > 500) {
      void tap('light');
      lastSaveHapticAt = now;
    }
    setTimeout(() => {
      if (saveState === 'saved') saveState = 'idle';
    }, 1200);
  }

  function onTitleChange(s: string): void {
    if (!activeNoteId) return;
    saveState = 'saving';
    notesStore.update(activeNoteId, { title: s });
    saveState = 'saved';
  }

  function onToolbarAction(action: ToolbarAction): void {
    if (!activeNote) return;
    const insert = (text: string, cursorOffset = 0): void => {
      const next = (activeNote.content ?? '') + text;
      notesStore.update(activeNote.id, { content: next });
      void cursorOffset;
    };
    switch (action) {
      case 'bold':
        insert(' **bold** ');
        break;
      case 'italic':
        insert(' *italic* ');
        break;
      case 'code':
        insert(' `code` ');
        break;
      case 'link':
        insert(' [text](https://) ');
        break;
      case 'list':
        insert('\n- item\n- item\n- item\n');
        break;
      case 'heading': {
        const toolbar = document.querySelector<HTMLElement>('[data-testid="note-toolbar"]');
        const heading = toolbar?.getAttribute('data-heading-level') ?? '1';
        insert(`\n${'#'.repeat(Number(heading))} Heading\n`);
        break;
      }
      case 'image':
        insert(' ![alt](https://) ');
        break;
    }
  }

  function setMode(m: Mode): void {
    mode = m;
    void hapticImpact({ light: true });
  }

  async function shareCurrent(): Promise<void> {
    if (!activeNote) return;
    await share({
      title: activeNote.title,
      text: activeNote.content,
    });
  }

  async function copyCurrent(): Promise<void> {
    if (!activeNote) return;
    await copyToClipboard(`${activeNote.title}\n\n${activeNote.content}`);
  }

  function onTagInput(e: Event): void {
    const input = e.target as HTMLInputElement;
    const value = input.value;
    const cursor = input.selectionStart ?? value.length;
    const upToCursor = value.slice(0, cursor);
    const lastHash = upToCursor.lastIndexOf('#');
    if (lastHash >= 0 && /\s/.test(upToCursor[lastHash - 1] ?? ' ')) {
      // hash preceded by whitespace — could be a tag
      const after = upToCursor.slice(lastHash + 1);
      if (/^[\w-]*$/.test(after)) {
        tagQuery = after;
        tagPopupOpen = true;
        tagAnchor = 'top';
        return;
      }
    }
    tagPopupOpen = false;
  }

  function onTagSelect(tag: string): void {
    if (!activeNote) return;
    const next = `${activeNote.content} #${tag}\n`;
    notesStore.update(activeNote.id, { content: next });
    tagPopupOpen = false;
  }
</script>

<main class="notes-view" data-testid="notes-view" data-view={view}>
  {#if settingsOpen}
    <SettingsView onBack={closeSettings} onReplayOnboarding={replayOnboarding} />
  {:else if view === 'list'}
    <header class="notes-view__header">
      <h1 class="notes-view__title">Pulse Notes</h1>
      <button type="button" class="btn btn--primary" onclick={createNote} data-testid="new-note">
        New note
      </button>
      <button
        type="button"
        class="btn btn--ghost notes-view__gear"
        onclick={openSettings}
        data-testid="open-settings"
        aria-label="Open settings"
        title="Settings"
      >
        <svg
          class="notes-view__gear-icon"
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
          <circle cx="12" cy="12" r="3" />
          <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
          />
        </svg>
        <span class="sr-only">Settings</span>
      </button>
    </header>
    <ul class="notes-view__list" data-testid="notes-list">
      {#each notes as n (n.id)}
        <li>
          <button
            type="button"
            class="notes-card"
            onclick={() => openNote(n.id)}
            data-testid={`note-card-${n.id}`}
            aria-label={`Open note ${n.title}`}
          >
            <h2 class="notes-card__title">{n.title || 'Untitled'}</h2>
            <p class="notes-card__preview">{n.content.slice(0, 120).replace(/\n/g, ' ')}</p>
            <div class="notes-card__meta">
              <span class="notes-card__date">
                {new Date(n.updatedAt).toLocaleDateString()}
              </span>
              {#if n.tags && n.tags.length}
                <span class="notes-card__tags">#{n.tags.join(' #')}</span>
              {/if}
            </div>
          </button>
        </li>
      {/each}
    </ul>
  {:else if view === 'note' && activeNote}
    <header class="notes-view__header notes-view__header--note">
      <button
        type="button"
        class="btn btn--ghost"
        onclick={() => (view = 'list')}
        data-testid="back-button"
        aria-label="Back to notes list"
      >
        Back
      </button>
      <input
        bind:this={titleInput}
        class="notes-view__title-input"
        type="text"
        value={activeNote.title}
        oninput={(e) => onTitleChange((e.target as HTMLInputElement).value)}
        aria-label="Note title"
        data-testid="title-input"
      />
      <div class="notes-view__modes" role="tablist" aria-label="View mode">
        {#each ['source', 'preview', 'split'] as m (m)}
          <button
            type="button"
            class="notes-view__mode-btn"
            class:notes-view__mode-btn--active={mode === m}
            role="tab"
            aria-selected={mode === m}
            data-testid={`mode-${m}`}
            onclick={() => setMode(m as Mode)}
          >
            {m}
          </button>
        {/each}
      </div>
      <span class="notes-view__save" data-testid="save-state" data-state={saveState}>
        {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : ''}
      </span>
      <button
        type="button"
        class="btn btn--ghost"
        onclick={shareCurrent}
        aria-label="Share note"
        data-testid="share-btn"
      >
        Share
      </button>
      <button
        type="button"
        class="btn btn--ghost"
        onclick={copyCurrent}
        aria-label="Copy note to clipboard"
        data-testid="copy-btn"
      >
        Copy
      </button>
      <button
        type="button"
        class="btn btn--danger"
        onclick={deleteCurrentNote}
        aria-label="Delete note"
        data-testid="delete-btn"
      >
        Delete
      </button>
    </header>

    <NoteToolbar
      onAction={onToolbarAction}
      disabled={mode === 'preview'}
      activeNoteId={activeNoteId}
    />

    <div class="notes-view__body" data-mode={mode}>
      {#if mode === 'split'}
        <SplitPane initialRatio={0.5} minRatio={0.2} maxRatio={0.8} persistKey={`split-${activeNote.id}`}>
          {#snippet children(_slot: string)}
            <div class="notes-view__pane">
              <MarkdownEditor
                value={activeNote.content}
                onChange={onContentChange}
                mode="source"
                placeholder="Start writing…"
              />
            </div>
            <div class="notes-view__pane">
              <MarkdownPreview source={activeNote.content} />
            </div>
          {/snippet}
        </SplitPane>
      {:else if mode === 'source'}
        <MarkdownEditor
          value={activeNote.content}
          onChange={onContentChange}
          mode="source"
          placeholder="Start writing…"
        />
      {:else}
        <MarkdownPreview source={activeNote.content} />
      {/if}
    </div>

    <footer class="notes-view__footer">
      <div class="notes-view__tags" data-testid="note-tags">
        <span class="notes-view__label">Tags:</span>
        {#each noteTags as t (t)}
          <span class="tag-chip">#{t}</span>
        {/each}
        <input
          type="text"
          class="notes-view__tag-input"
          placeholder="add tag…"
          aria-label="Add tag"
          oninput={onTagInput}
          data-testid="tag-input"
        />
        <TagAutocomplete
          open={tagPopupOpen}
          query={tagQuery}
          tags={tags}
          onSelect={onTagSelect}
          onDismiss={() => (tagPopupOpen = false)}
          anchor={tagAnchor}
        />
      </div>
      <button
        type="button"
        class="btn btn--ghost notes-view__backlinks-toggle"
        onclick={() => (showBacklinks = !showBacklinks)}
        aria-expanded={showBacklinks}
        data-testid="backlinks-toggle"
      >
        Backlinks ({backlinksTo.length})
      </button>
    </footer>

    {#if showBacklinks}
      <aside class="notes-view__backlinks" data-testid="backlinks-panel">
        <h3>Linked from</h3>
        {#if backlinksTo.length === 0}
          <p class="notes-view__empty">No other notes link here yet.</p>
        {:else}
          <ul>
            {#each backlinksTo as b (b.id)}
              <li>
                <button
                  type="button"
                  class="notes-view__backlink"
                  onclick={() => openNote(b.id)}
                  data-testid={`backlink-${b.id}`}
                >
                  {b.title}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </aside>
    {/if}
  {/if}
</main>

<style>
  .notes-view {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    min-height: 100dvh;
    background: var(--tn-bg, #1a1b26);
    color: var(--tn-fg, #c0caf5);
    padding-bottom: env(safe-area-inset-bottom);
  }
  .notes-view__header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    border-bottom: 1px solid var(--tn-border, #414868);
    background: var(--tn-bg-elevated, #24283b);
  }
  .notes-view__title {
    margin: 0;
    font-size: 20px;
    flex: 1;
  }
  .notes-view__gear {
    min-width: var(--tn-touch-min, 44px);
    min-height: var(--tn-touch-min, 44px);
    padding: 0 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .notes-view__gear-icon {
    display: block;
  }
  .notes-view__header--note {
    flex-wrap: wrap;
  }
  .notes-view__title-input {
    flex: 1 1 200px;
    min-height: 44px;
    font-size: 16px;
    font-weight: 600;
    background: var(--tn-bg, #1a1b26);
  }
  .notes-view__modes {
    display: flex;
    gap: 4px;
    background: var(--tn-bg, #1a1b26);
    border-radius: 8px;
    padding: 4px;
  }
  .notes-view__mode-btn {
    min-height: var(--tn-touch-min, 44px); /* M3 — was 36px (R95b) */
    min-width: var(--tn-touch-min, 44px);
    padding: 0 12px;
    border-radius: 6px;
    color: var(--tn-fg-dim, #9aa5ce);
    background: transparent;
    border: 0;
    cursor: pointer;
    text-transform: capitalize;
    font-size: 14px;
  }
  .notes-view__mode-btn--active {
    background: var(--tn-bg-elevated, #24283b);
    color: var(--tn-fg, #c0caf5);
  }
  .notes-view__save {
    font-size: 12px;
    color: var(--tn-fg-muted, #565f89);
    min-width: 60px;
    text-align: right;
  }
  .notes-view__save[data-state='saving'] { color: var(--tn-accent-yellow, #e0af68); }
  .notes-view__save[data-state='saved'] { color: var(--tn-accent-green, #9ece6a); }

  .notes-view__body {
    flex: 1 1 auto;
    min-height: 0;
    padding: 12px;
  }
  .notes-view__pane {
    height: 100%;
    overflow: hidden;
  }

  .notes-view__footer {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    padding: 12px 16px;
    border-top: 1px solid var(--tn-border, #414868);
    background: var(--tn-bg-elevated, #24283b);
  }
  .notes-view__tags {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    flex: 1;
    position: relative;
  }
  .notes-view__label {
    color: var(--tn-fg-muted, #565f89);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .tag-chip {
    background: rgba(187, 154, 247, 0.12);
    color: var(--tn-accent-purple, #bb9af7);
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 13px;
    font-family: var(--tn-font-mono, monospace);
  }
  .notes-view__tag-input {
    min-height: var(--tn-touch-min, 44px); /* M3 — was 32px (R95b) */
    min-width: var(--tn-touch-min, 44px);
    padding: 4px 10px;
    font-size: 13px;
    background: var(--tn-bg, #1a1b26);
    border: 1px solid var(--tn-border, #414868);
    border-radius: 12px;
    color: var(--tn-fg, #c0caf5);
  }

  .notes-view__backlinks-panel {
    background: var(--tn-bg-elevated, #24283b);
    padding: 12px 16px;
    border-top: 1px solid var(--tn-border, #414868);
  }
  .notes-view__backlinks {
    background: var(--tn-bg-elevated, #24283b);
    padding: 12px 16px;
    border-top: 1px solid var(--tn-border, #414868);
  }
  .notes-view__backlinks h3 {
    margin: 0 0 8px;
    font-size: 14px;
    color: var(--tn-fg-dim, #9aa5ce);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .notes-view__backlinks ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .notes-view__backlink {
    width: 100%;
    text-align: left;
    padding: 8px 12px;
    min-height: var(--tn-touch-min, 44px); /* M3 — was 36px (R95b) */
    min-width: var(--tn-touch-min, 44px);
    color: var(--tn-fg, #c0caf5);
    background: transparent;
    border: 0;
    border-radius: 6px;
    cursor: pointer;
  }
  .notes-view__backlink:hover {
    background: var(--tn-bg-overlay, #1f2335);
  }
  .notes-view__empty {
    color: var(--tn-fg-muted, #565f89);
    font-size: 14px;
    margin: 0;
  }
  .notes-view__backlinks-toggle {
    flex: 0 0 auto;
  }

  .notes-view__list {
    list-style: none;
    margin: 0;
    padding: 16px;
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .notes-card {
    width: 100%;
    text-align: left;
    background: var(--tn-bg-elevated, #24283b);
    border: 1px solid var(--tn-border, #414868);
    border-radius: var(--tn-radius-md, 12px);
    padding: 16px;
    cursor: pointer;
    transition: border-color 0.15s, transform 0.15s;
  }
  .notes-card:hover {
    border-color: var(--tn-accent-blue, #7aa2f7);
  }
  .notes-card:active {
    transform: scale(0.99);
  }
  .notes-card__title {
    margin: 0 0 6px;
    font-size: 16px;
  }
  .notes-card__preview {
    margin: 0 0 8px;
    color: var(--tn-fg-dim, #9aa5ce);
    font-size: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .notes-card__meta {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: var(--tn-fg-muted, #565f89);
  }
  .notes-card__tags {
    color: var(--tn-accent-purple, #bb9af7);
  }

  .btn {
    min-height: 44px;
    padding: 0 16px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
  }
  .btn--primary {
    background: var(--tn-accent-blue, #7aa2f7);
    color: var(--tn-bg, #1a1b26);
  }
  .btn--ghost {
    background: transparent;
    color: var(--tn-fg-dim, #9aa5ce);
    border-color: var(--tn-border, #414868);
  }
  .btn--ghost:hover {
    color: var(--tn-fg, #c0caf5);
  }
  .btn--danger {
    background: transparent;
    color: var(--tn-accent-red, #f7768e);
    border-color: var(--tn-accent-red, #f7768e);
  }
  .btn--danger:hover {
    background: rgba(247, 118, 142, 0.1);
  }
</style>
