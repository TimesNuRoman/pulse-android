import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import NotesView from '../NotesView.svelte';
import { notesStore } from '$lib/notesStore';

describe('NotesView', () => {
  beforeEach(() => {
    localStorage.clear();
    notesStore.resetToMocks();
  });
  afterEach(cleanup);

  it('renders the notes list view by default', () => {
    render(NotesView);
    expect(screen.getByTestId('notes-view')).toHaveAttribute('data-view', 'list');
    expect(screen.getByText('Pulse Notes')).toBeInTheDocument();
  });

  it('renders 8 note cards from MOCK_NOTES', () => {
    render(NotesView);
    const list = screen.getByTestId('notes-list');
    const items = list.querySelectorAll('li');
    expect(items.length).toBe(8);
  });

  it('shows the New note button', () => {
    render(NotesView);
    expect(screen.getByTestId('new-note')).toBeInTheDocument();
  });

  it('clicking a note card opens the note view', async () => {
    render(NotesView);
    const first = screen.getByTestId('note-card-n1');
    await fireEvent.click(first);
    expect(screen.getByTestId('notes-view')).toHaveAttribute('data-view', 'note');
  });

  it('clicking New note creates and opens a fresh note', async () => {
    render(NotesView);
    await fireEvent.click(screen.getByTestId('new-note'));
    expect(screen.getByTestId('notes-view')).toHaveAttribute('data-view', 'note');
    // title input should be empty (or "Untitled")
    const title = screen.getByTestId('title-input') as HTMLInputElement;
    expect(['Untitled', '']).toContain(title.value);
  });

  it('mode toggle switches between source/preview/split', async () => {
    render(NotesView);
    await fireEvent.click(screen.getByTestId('note-card-n1'));
    await fireEvent.click(screen.getByTestId('mode-source'));
    expect(screen.getByTestId('mode-source')).toHaveAttribute('aria-selected', 'true');
    await fireEvent.click(screen.getByTestId('mode-preview'));
    expect(screen.getByTestId('mode-preview')).toHaveAttribute('aria-selected', 'true');
  });

  it('shows the toolbar with 8 actions (7 markdown + voice)', async () => {
    render(NotesView);
    await fireEvent.click(screen.getByTestId('note-card-n1'));
    const toolbar = screen.getByTestId('note-toolbar');
    expect(toolbar).toBeInTheDocument();
    expect(toolbar.querySelectorAll('button').length).toBe(8);
    // Voice mic is the 8th tool, separated from the markdown group.
    expect(screen.getByTestId('toolbar-voice')).toBeInTheDocument();
  });

  it('shows tag chips for tags in the note', async () => {
    render(NotesView);
    await fireEvent.click(screen.getByTestId('note-card-n1'));
    const tagsContainer = screen.getByTestId('note-tags');
    expect(tagsContainer).toBeInTheDocument();
    // n1 has #pulse, #notes, #v0-6-0
    expect(tagsContainer.textContent).toContain('#pulse');
    expect(tagsContainer.textContent).toContain('#notes');
  });

  it('Backlinks button shows count', async () => {
    render(NotesView);
    await fireEvent.click(screen.getByTestId('note-card-n1'));
    const toggle = screen.getByTestId('backlinks-toggle');
    expect(toggle).toBeInTheDocument();
    expect(toggle.textContent).toMatch(/Backlinks \(\d+\)/);
  });

  it('clicking Backlinks toggle reveals the backlinks panel', async () => {
    render(NotesView);
    await fireEvent.click(screen.getByTestId('note-card-n1'));
    await fireEvent.click(screen.getByTestId('backlinks-toggle'));
    expect(screen.getByTestId('backlinks-panel')).toBeInTheDocument();
  });

  it('back button returns to list view', async () => {
    render(NotesView);
    await fireEvent.click(screen.getByTestId('note-card-n1'));
    await fireEvent.click(screen.getByTestId('back-button'));
    expect(screen.getByTestId('notes-view')).toHaveAttribute('data-view', 'list');
  });

  it('Share and Copy buttons are present', async () => {
    render(NotesView);
    await fireEvent.click(screen.getByTestId('note-card-n1'));
    expect(screen.getByTestId('share-btn')).toBeInTheDocument();
    expect(screen.getByTestId('copy-btn')).toBeInTheDocument();
  });

  it('Delete button removes the current note', async () => {
    render(NotesView);
    await fireEvent.click(screen.getByTestId('note-card-n1'));
    expect(notesStore.get('n1')).toBeDefined();
    await fireEvent.click(screen.getByTestId('delete-btn'));
    expect(notesStore.get('n1')).toBeUndefined();
    expect(screen.getByTestId('notes-view')).toHaveAttribute('data-view', 'list');
  });

  it('title input is editable', async () => {
    render(NotesView);
    await fireEvent.click(screen.getByTestId('note-card-n1'));
    const title = screen.getByTestId('title-input') as HTMLInputElement;
    expect(title.value).toBe('Welcome to Pulse Notes');
    await fireEvent.input(title, { target: { value: 'Renamed note' } });
    expect(notesStore.get('n1')?.title).toBe('Renamed note');
  });
});
