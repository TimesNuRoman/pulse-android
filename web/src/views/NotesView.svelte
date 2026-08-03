<script lang="ts">
  import MarkdownEditor from '../components/notes/MarkdownEditor.svelte';
  import MarkdownPreview from '../components/notes/MarkdownPreview.svelte';
  import NoteToolbar, { type ToolbarAction } from '../components/notes/NoteToolbar.svelte';
  import TagAutocomplete from '../components/notes/TagAutocomplete.svelte';
  import TemplatePicker from '../components/TemplatePicker.svelte';
  import SplitPane from '../components/notes/SplitPane.svelte';
  import NotesSearch from '../components/NotesSearch.svelte';
  import SettingsView from './SettingsView.svelte';
  import {
    notesStore,
    activeSortedNotes,
    archivedSortedNotes,
    allTags,
    backlinkIndex,
  } from '../lib/notesStore';
  import {
    extractBacklinks,
    extractTags,
    type Note,
  } from '../lib/notesBacklinks';
  import {
    getAllNoteColors,
    getNoteColorHex,
    type NoteColor,
  } from '../lib/noteColors';
  import { searchNotes } from '../lib/notesSearch';
  import { share, copyToClipboard, hapticImpact } from '../lib/capacitor';
  import { tap } from '../lib/haptics';
  import { substituteTemplate, type NoteTemplate } from '../lib/noteTemplates';
  import { saveNoteFile } from '../lib/noteExportFileSystem';
  import type { ExportFormat } from '../lib/noteExport';

  type Mode = 'source' | 'preview' | 'split';
  type View = 'list' | 'note' | 'archive';
  type ExportMenuFormat = ExportFormat;

  interface Props {
    onReplayOnboarding?: () => void;
    pendingNoteId?: string | null;
    onNoteOpened?: () => void;
  }
  let { onReplayOnboarding, pendingNoteId = null, onNoteOpened }: Props = $props();

  let view: View = $state('list');
  let settingsOpen: boolean = $state(false);
  let activeNoteId: string | null = $state(null);
  let mode: Mode = $state('split');
  let saveState: 'idle' | 'saving' | 'saved' = $state('idle');
  let titleInput: HTMLInputElement | undefined = $state();
  let showBacklinks: boolean = $state(false);
  let searchQuery: string = $state('');

  // R185 — per-note export menu state + ephemeral toast.
  let exportMenuOpen: boolean = $state(false);
  let exportMenuRoot: HTMLDivElement | undefined = $state();
  let exportToast: string = $state('');
  let exportToastTimer: ReturnType<typeof setTimeout> | null = null;

  // Tag autocomplete state
  let tagPopupOpen: boolean = $state(false);
  let tagQuery: string = $state('');
  let tagAnchor: 'top' | 'bottom' = $state('top');

  // Archive state
  let archiveConfirm: 'none' | 'empty' | { id: string } = $state('none');

  // R190 — note template picker state
  let templateOpen: boolean = $state(false);
  let templateButtonEl: HTMLButtonElement | undefined = $state();

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
  const archivedNotes = $derived($archivedSortedNotes);
  const tags = $derived($allTags);
  const backlinksTo = $derived.by((): Note[] => {
    if (!activeNote) return [];
    return $backlinkIndex.get(activeNote.title.toLowerCase()) ?? [];
  });
  const noteTags = $derived(activeNote ? extractTags(activeNote.content) : []);
  const colors = $derived(getAllNoteColors());
  const activeColor = $derived(activeNote?.color ?? 'none');

  // R193 — notes full-text search. Empty query → upstream `$activeSortedNotes`
  // (preserves R202 archive filter + R187 sort). Non-empty → 6-level scored + tiebroken result.
  const visibleNotes = $derived(
    searchQuery.trim() ? searchNotes($activeSortedNotes, searchQuery) : $activeSortedNotes,
  );
  const notes = $derived(visibleNotes);
  const searchResultCount = $derived(notes.length);

  // R193 — fire a `selection` haptic on empty ↔ non-empty filter transitions
  // (start a search, clear a search). Mid-typing transitions stay quiet.
  let prevSearchQuery = '';
  $effect(() => {
    const q = searchQuery;
    const wasEmpty = prevSearchQuery === '';
    const isEmpty = q === '';
    prevSearchQuery = q;
    if (wasEmpty !== isEmpty) {
      void tap('selection');
    }
  });

  function openNote(id: string): void {
    activeNoteId = id;
    view = 'note';
    saveState = 'idle';
    void hapticImpact({ light: true });
    onNoteOpened?.();
  }

  // R173 — when App.svelte receives a deep link, it passes the note id in.
  // Wait until the notes have loaded, then open it.
  $effect(() => {
    if (!pendingNoteId) return;
    const list = $notesStore;
    if (list.length === 0) return;
    const exists = list.find((n) => n.id === pendingNoteId);
    if (exists) {
      openNote(pendingNoteId);
    }
  });

  function createNote(): void {
    const note = notesStore.create('# New note\n\nStart writing…');
    openNote(note.id);
  }

  // R190 — open the template picker (R118 selection haptic on toggle).
  function openTemplatePicker(): void {
    void tap('selection');
    templateOpen = !templateOpen;
  }
  function closeTemplatePicker(): void {
    templateOpen = false;
  }
  // R190 — pick a template, create the note with the substituted body, open it.
  function pickTemplate(t: NoteTemplate): void {
    const body = substituteTemplate(t);
    const note = notesStore.create(body);
    templateOpen = false;
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

  // R202 — archive the active note (reversible delete). Sends the user back
  // to the list. Archived notes are hidden from `notes` (driven by
  // `activeSortedNotes`) so re-opening the same id would 404. That's
  // intentional: archive + view = different mode.
  function archiveCurrentNote(): void {
    if (!activeNoteId) return;
    void tap('selection');
    notesStore.archiveNote(activeNoteId);
    activeNoteId = null;
    view = 'list';
  }

  // R202 — open the archive view. `selection` haptic matches the open
  // settings tab. The archive view reuses the list layout.
  function openArchive(): void {
    void tap('selection');
    activeNoteId = null;
    view = 'archive';
  }

  // R202 — restore a note from the archive. `selection` haptic.
  function restoreNoteById(id: string): void {
    void tap('selection');
    notesStore.restoreNote(id);
  }

  // R202 — permanent delete of a single archived note. `medium` haptic,
  // matches the hard-delete action feel.
  function deleteArchivedNote(id: string): void {
    void tap('medium');
    notesStore.delete(id);
  }

  // R202 — empty the entire archive (permanent, no undo). The
  // `archiveConfirm` state gates this behind an explicit confirmation
  // tap so a single misclick can't wipe the archive.
  function confirmEmptyArchive(): void {
    archiveConfirm = 'empty';
  }
  function cancelEmptyArchive(): void {
    archiveConfirm = 'none';
  }
  function doEmptyArchive(): void {
    void tap('medium');
    notesStore.emptyArchive();
    archiveConfirm = 'none';
  }

  // R187 — pin/favorite. The store returns true if the id matched
  // (so we can decide whether to fire the haptic without a redundant
  // get()). Tap-style = 'selection' (R118): pin is a "state flip" and
  // belongs to the same family as tab switches, not content edits.
  function togglePin(id: string): void {
    const found = notesStore.togglePin(id);
    if (found) void tap('selection');
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

  // R185 — open / dismiss the per-note export popover.
  function toggleExportMenu(): void {
    void tap('selection');
    exportMenuOpen = !exportMenuOpen;
  }

  // R185 — close the popover on outside click or Escape. The handler
  // is attached while the menu is open and torn down on close.
  $effect(() => {
    if (!exportMenuOpen || typeof window === 'undefined') return;
    const onPointer = (e: MouseEvent): void => {
      const root = exportMenuRoot;
      if (!root) return;
      if (e.target instanceof Node && root.contains(e.target)) return;
      exportMenuOpen = false;
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') exportMenuOpen = false;
    };
    window.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey);
    return (): void => {
      window.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  });

  function showExportToast(message: string): void {
    exportToast = message;
    if (exportToastTimer) clearTimeout(exportToastTimer);
    exportToastTimer = setTimeout(() => {
      exportToast = '';
      exportToastTimer = null;
    }, 2400);
  }

  async function exportCurrentNote(format: ExportMenuFormat): Promise<void> {
    if (!activeNote) return;
    exportMenuOpen = false;
    void tap('light');
    const result = await saveNoteFile(activeNote, format);
    if (result.transport === 'noop') {
      showExportToast('Could not save — no transport available');
      return;
    }
    const verb = result.transport === 'native-share' ? 'Shared' : 'Saved';
    showExportToast(`${verb} as ${result.filename}`);
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

  // R196 — color tag picker. Tapping the current color removes it
  // (toggles to 'none'). Tapping 'none' is a no-op if the note has no
  // color. Selection haptic on every successful change.
  function onPickColor(color: NoteColor): void {
    if (!activeNote) return;
    const current = activeNote.color ?? 'none';
    const next: NoteColor = current === color ? 'none' : color;
    notesStore.setColor(activeNote.id, next);
    void tap('selection');
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
      <div class="notes-view__template-anchor">
        <button
          bind:this={templateButtonEl}
          type="button"
          class="btn btn--ghost"
          onclick={openTemplatePicker}
          data-testid="open-template-picker"
          aria-haspopup="listbox"
          aria-expanded={templateOpen}
          aria-label="New note from template"
          title="New from template"
        >
          <svg
            class="notes-view__template-icon"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          <span class="notes-view__template-label">Template</span>
        </button>
        <TemplatePicker
          open={templateOpen}
          trigger={templateButtonEl ?? null}
          onpick={pickTemplate}
          ondismiss={closeTemplatePicker}
        />
      </div>
      <button
        type="button"
        class="btn btn--ghost notes-view__archive-toggle"
        onclick={openArchive}
        data-testid="view-archive"
        aria-label="View archived notes"
        title="Archive"
      >
        Archive
        {#if archivedNotes.length > 0}
          <span class="notes-view__badge" data-testid="archive-badge">
            {archivedNotes.length}
          </span>
        {/if}
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
    <NotesSearch
      bind:query={searchQuery}
      filteredCount={searchResultCount}
      totalCount={$activeSortedNotes.length}
    />
    <ul class="notes-view__list" data-testid="notes-list">
      {#each notes as n (n.id)}
        <li class="notes-list__item" class:notes-list__item--pinned={!!n.pinnedAt}>
          <button
            type="button"
            class="notes-card"
            class:notes-card--has-color={n.color}
            style:border-left-color={n.color ? (getNoteColorHex(n.color) ?? 'transparent') : 'transparent'}
            onclick={() => openNote(n.id)}
            data-testid={`note-card-${n.id}`}
            data-color={n.color ?? 'none'}
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
          <button
            type="button"
            class="notes-list__pin-btn"
            onclick={() => togglePin(n.id)}
            aria-label={n.pinnedAt ? 'Unpin note' : 'Pin note'}
            aria-pressed={!!n.pinnedAt}
            title={n.pinnedAt ? 'Unpin' : 'Pin'}
            data-testid={`pin-btn-${n.id}`}
          >
            <svg
              class="notes-list__pin-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill={n.pinnedAt ? 'currentColor' : 'none'}
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <!-- 5-point star — universally readable "favorite/important" mark.
                   fill toggles via aria-pressed → currentColor (purple when pinned). -->
              <path d="M12 2 L14.5 8.8 L22 9.3 L16.5 14.1 L18.3 21.5 L12 17.5 L5.7 21.5 L7.5 14.1 L2 9.3 L9.5 8.8 Z" />
            </svg>
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
      <div
        class="notes-view__color-picker"
        role="radiogroup"
        aria-label="Note color"
        data-testid="color-picker"
      >
        {#each colors as c (c.id)}
          <button
            type="button"
            class="notes-view__color-dot"
            class:notes-view__color-dot--selected={activeColor === c.id}
            class:notes-view__color-dot--none={c.id === 'none'}
            style:--dot-color={c.hex ?? 'transparent'}
            role="radio"
            aria-checked={activeColor === c.id}
            aria-label={c.id === 'none'
              ? 'Remove color'
              : `Set note color to ${c.label}`}
            title={c.label}
            data-testid={`color-${c.id}`}
            data-color={c.id}
            onclick={() => onPickColor(c.id)}
          >
            {#if c.id === 'none'}
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                aria-hidden="true"
                focusable="false"
              >
                <line x1="2" y1="10" x2="10" y2="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            {/if}
          </button>
        {/each}
      </div>
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
      <div class="notes-view__export-wrap" bind:this={exportMenuRoot}>
        <button
          type="button"
          class="btn btn--ghost"
          onclick={toggleExportMenu}
          aria-label="Export note"
          aria-haspopup="menu"
          aria-expanded={exportMenuOpen}
          data-testid="export-btn"
        >
          Export
        </button>
        {#if exportMenuOpen}
          <div
            class="notes-view__export-menu"
            role="menu"
            aria-label="Export note as"
            data-testid="export-menu"
          >
            <button
              type="button"
              role="menuitem"
              class="notes-view__export-item"
              onclick={() => exportCurrentNote('md')}
              aria-label="Export note as Markdown"
              data-testid="export-md"
            >
              Markdown (.md)
            </button>
            <button
              type="button"
              role="menuitem"
              class="notes-view__export-item"
              onclick={() => exportCurrentNote('json')}
              aria-label="Export note as JSON"
              data-testid="export-json"
            >
              JSON (.json)
            </button>
          </div>
        {/if}
      </div>
      <button
        type="button"
        class="btn btn--ghost"
        onclick={archiveCurrentNote}
        aria-label="Archive note"
        data-testid="archive-btn"
      >
        Archive
      </button>
      <button
        type="button"
        class="btn btn--ghost notes-view__header-pin"
        onclick={() => activeNote && togglePin(activeNote.id)}
        aria-label={activeNote.pinnedAt ? 'Unpin note' : 'Pin note'}
        aria-pressed={!!activeNote.pinnedAt}
        title={activeNote.pinnedAt ? 'Unpin' : 'Pin'}
        data-testid="header-pin-btn"
      >
        <svg
          class="notes-view__header-pin-icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill={activeNote.pinnedAt ? 'currentColor' : 'none'}
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 2 L14.5 8.8 L22 9.3 L16.5 14.1 L18.3 21.5 L12 17.5 L5.7 21.5 L7.5 14.1 L2 9.3 L9.5 8.8 Z" />
        </svg>
        {activeNote.pinnedAt ? 'Unpin' : 'Pin'}
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
  {:else if view === 'archive'}
    <header class="notes-view__header">
      <button
        type="button"
        class="btn btn--ghost"
        onclick={() => (view = 'list')}
        data-testid="archive-back"
        aria-label="Back to notes list"
      >
        Back
      </button>
      <h1 class="notes-view__title">Archive</h1>
      <button
        type="button"
        class="btn btn--danger notes-view__empty-archive"
        onclick={confirmEmptyArchive}
        aria-label="Empty archive permanently"
        data-testid="empty-archive-btn"
        disabled={archivedNotes.length === 0}
      >
        Empty archive
      </button>
    </header>

    {#if archiveConfirm === 'empty'}
      <div
        class="notes-view__confirm"
        role="alertdialog"
        aria-labelledby="empty-archive-title"
        aria-describedby="empty-archive-desc"
        data-testid="empty-archive-confirm"
      >
        <p id="empty-archive-title" class="notes-view__confirm-title">
          Empty archive permanently?
        </p>
        <p id="empty-archive-desc" class="notes-view__confirm-desc">
          {archivedNotes.length} note{archivedNotes.length === 1 ? '' : 's'} will be deleted. This cannot be undone.
        </p>
        <div class="notes-view__confirm-actions">
          <button
            type="button"
            class="btn btn--ghost"
            onclick={cancelEmptyArchive}
            data-testid="empty-archive-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn btn--danger"
            onclick={doEmptyArchive}
            data-testid="empty-archive-confirm-btn"
          >
            Delete all
          </button>
        </div>
      </div>
    {/if}

    {#if archivedNotes.length === 0}
      <p class="notes-view__empty" data-testid="archive-empty">
        No archived notes. Archived notes appear here.
      </p>
    {:else}
      <ul class="notes-view__list" data-testid="archive-list">
        {#each archivedNotes as n (n.id)}
          <li class="notes-view__archive-item">
            <div class="notes-view__archive-meta">
              <h2 class="notes-card__title notes-view__archive-title">{n.title || 'Untitled'}</h2>
              <p class="notes-card__preview">
                {n.content.slice(0, 120).replace(/\n/g, ' ')}
              </p>
              <span class="notes-view__archive-date">
                Archived {n.archivedAt ? new Date(n.archivedAt).toLocaleDateString() : ''}
              </span>
            </div>
            <div class="notes-view__archive-actions">
              <button
                type="button"
                class="btn btn--primary"
                onclick={() => restoreNoteById(n.id)}
                aria-label={`Restore note ${n.title}`}
                data-testid={`restore-${n.id}`}
              >
                Restore
              </button>
              <button
                type="button"
                class="btn btn--danger"
                onclick={() => deleteArchivedNote(n.id)}
                aria-label={`Delete permanently ${n.title}`}
                data-testid={`delete-archived-${n.id}`}
              >
                Delete
              </button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}

    {#if exportToast}
      <div
        class="notes-view__export-toast"
        role="status"
        aria-live="polite"
        data-testid="export-toast"
      >
        {exportToast}
      </div>
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
  /* R190 — anchor wrapper so the popover's `position: absolute` lands
     under the trigger button rather than the page body. */
  .notes-view__template-anchor {
    position: relative;
    display: inline-flex;
  }
  .notes-view__template-icon {
    display: block;
    margin-right: 6px;
  }
  .notes-view__template-label {
    font-size: 14px;
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
    border-left: 4px solid transparent; /* R196 — color tag left-border accent */
    border-radius: var(--tn-radius-md, 12px);
    padding: 16px;
    padding-left: 14px; /* compensate for thicker left border so title doesn't shift */
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

  /* R196 — color picker. 9 dots in a row. 56dp touch target, 24dp visual
   * dot, 2px border. Selected = highlighted ring + small scale-up.
   * Unselected = just the colored fill with a thin border. The `none`
   * swatch is a hollow circle with a diagonal slash, so it reads as
   * "no color". prefers-reduced-motion disables the color change
   * transition. */
  .notes-view__color-picker {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: var(--tn-bg, #1a1b26);
    border: 1px solid var(--tn-border, #414868);
    border-radius: 999px;
  }
  .notes-view__color-dot {
    --dot-color: transparent;
    position: relative;
    appearance: none;
    -webkit-appearance: none;
    background: transparent;
    border: 0;
    border-radius: 50%;
    /* Visible dot: 24x24, centered. Padding expands to 56x56 touch
     * area WITHOUT changing the visual size. */
    width: 56px;
    height: 56px;
    padding: 0;
    margin: 0;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--tn-fg-muted, #565f89);
    transition: transform 0.12s;
  }
  .notes-view__color-dot::before {
    content: '';
    display: block;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--dot-color);
    border: 2px solid var(--tn-border, #414868);
    box-sizing: border-box;
    transition: border-color 0.12s, box-shadow 0.12s;
  }
  .notes-view__color-dot:hover::before {
    border-color: var(--tn-fg-dim, #9aa5ce);
  }
  .notes-view__color-dot--selected::before {
    border-color: var(--tn-fg, #c0caf5);
    box-shadow: 0 0 0 2px var(--tn-bg, #1a1b26);
  }
  .notes-view__color-dot--selected {
    transform: scale(1.08);
  }
  .notes-view__color-dot--none::before {
    background: var(--tn-bg-elevated, #24283b);
  }
  @media (prefers-reduced-motion: reduce) {
    .notes-view__color-dot,
    .notes-view__color-dot::before {
      transition: none;
    }
    .notes-view__color-dot--selected {
      transform: none;
    }
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
  .btn[disabled] {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* R202 — archive view */
  .notes-view__archive-toggle {
    margin-left: auto;
  }

  /* R187 — pin/favorite row layout. The list <li> becomes a flex row:
     the existing notes-card takes the remaining width, and the pin
     button sits to its right with a 48dp touch target (M3 preferred). */
  .notes-list__item {
    display: flex;
    align-items: stretch;
    gap: var(--tn-sp-2, 8px);
  }
  .notes-list__item .notes-card {
    flex: 1 1 auto;
    min-width: 0;
  }
  .notes-list__item--pinned .notes-card {
    border-left: 3px solid var(--tn-accent-purple, #bb9af7);
  }
  .notes-list__pin-btn {
    flex: 0 0 auto;
    /* 48dp M3 preferred touch target. The icon inside is 16x16 — the
       wrapper carries the touch size, the SVG is just the glyph. */
    min-width: var(--tn-touch-pref, 48px);
    min-height: var(--tn-touch-pref, 48px);
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--tn-bg-elevated, #24283b);
    border: 1px solid var(--tn-border, #414868);
    border-radius: var(--tn-radius-md, 12px);
    color: var(--tn-fg-dim, #9aa5ce);
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }
  .notes-list__pin-btn[aria-pressed='true'] {
    color: var(--tn-accent-purple, #bb9af7);
    border-color: var(--tn-accent-purple, #bb9af7);
  }
  .notes-list__pin-btn:hover {
    color: var(--tn-fg, #c0caf5);
    border-color: var(--tn-fg-dim, #9aa5ce);
  }
  .notes-list__pin-btn[aria-pressed='true']:hover {
    color: var(--tn-accent-purple, #bb9af7);
  }
  .notes-list__pin-btn:focus-visible {
    outline: 2px solid var(--tn-accent-blue, #7aa2f7);
    outline-offset: 2px;
  }
  .notes-list__pin-icon {
    display: block;
  }

  /* R187 — single-note header pin button. Same icon, same color rule,
     but inside the existing btn--ghost styling so it lines up with
     Share/Copy visually. Min-height 44dp is already set by .btn. */
  .notes-view__header-pin {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .notes-view__header-pin[aria-pressed='true'] {
    color: var(--tn-accent-purple, #bb9af7);
    border-color: var(--tn-accent-purple, #bb9af7);
  }
  .notes-view__header-pin-icon {
    display: block;
  }

  .notes-view__badge {
    background: var(--tn-accent-purple, #bb9af7);
    color: var(--tn-bg, #1a1b26);
    border-radius: 10px;
    padding: 2px 8px;
    font-size: 12px;
    font-weight: 700;
    min-width: 20px;
    text-align: center;
  }
  .notes-view__archive-item {
    display: flex;
    align-items: stretch;
    gap: 12px;
    background: var(--tn-bg-elevated, #24283b);
    border: 1px solid var(--tn-border, #414868);
    border-radius: var(--tn-radius-md, 12px);
    padding: 12px;
    opacity: 0.85;
  }
  .notes-view__archive-item .notes-card__title {
    color: var(--tn-fg-dim, #9aa5ce);
    text-decoration: line-through;
  }
  .notes-view__archive-meta {
    flex: 1;
    min-width: 0;
  }
  .notes-view__archive-title {
    margin: 0 0 6px;
    font-size: 16px;
  }
  .notes-view__archive-date {
    display: block;
    margin-top: 6px;
    font-size: 12px;
    color: var(--tn-fg-muted, #565f89);
  }
  .notes-view__archive-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 0 0 auto;
    justify-content: center;
  }
  .notes-view__empty-archive {
    margin-left: auto;
  }
  .notes-view__confirm {
    margin: 16px;
    padding: 16px;
    background: var(--tn-bg-elevated, #24283b);
    border: 1px solid var(--tn-accent-red, #f7768e);
    border-radius: var(--tn-radius-md, 12px);
  }
  .notes-view__confirm-title {
    margin: 0 0 6px;
    font-size: 15px;
    font-weight: 600;
    color: var(--tn-accent-red, #f7768e);
  }
  .notes-view__confirm-desc {
    margin: 0 0 12px;
    font-size: 13px;
    color: var(--tn-fg-dim, #9aa5ce);
  }
  .notes-view__confirm-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
  @media (prefers-reduced-motion: reduce) {
    .notes-view__archive-item,
    .notes-card,
    .notes-list__pin-btn,
    .notes-view__header-pin {
      transition: none;
    }
  }
</style>
