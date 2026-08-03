// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import NotesSearch from '../NotesSearch.svelte';

describe('NotesSearch', () => {
  afterEach(cleanup);

  it('renders input + count, hides clear button when empty', () => {
    render(NotesSearch, {
      props: { query: '', filteredCount: 0, totalCount: 5 },
    });
    const input = screen.getByTestId('notes-search-input');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-label', 'Search notes');
    expect(screen.getByTestId('notes-search-count')).toBeInTheDocument();
    expect(screen.queryByTestId('notes-search-clear')).not.toBeInTheDocument();
  });

  it('shows "Showing all N" when query is empty', () => {
    render(NotesSearch, {
      props: { query: '', filteredCount: 0, totalCount: 47 },
    });
    expect(screen.getByTestId('notes-search-count').textContent?.trim()).toBe(
      'Showing all 47',
    );
  });

  it('shows "No results" when filteredCount is 0 and query non-empty', () => {
    render(NotesSearch, {
      props: { query: 'zzz', filteredCount: 0, totalCount: 12 },
    });
    expect(screen.getByTestId('notes-search-count').textContent?.trim()).toBe(
      'No results',
    );
  });

  it('uses singular "1 result" for one match', () => {
    render(NotesSearch, {
      props: { query: 'rust', filteredCount: 1, totalCount: 12 },
    });
    expect(screen.getByTestId('notes-search-count').textContent?.trim()).toBe(
      '1 result',
    );
  });

  it('uses plural "N results" for multiple matches', () => {
    render(NotesSearch, {
      props: { query: 'note', filteredCount: 12, totalCount: 47 },
    });
    expect(screen.getByTestId('notes-search-count').textContent?.trim()).toBe(
      '12 results',
    );
  });

  it('reflects query prop into the input value (external sync)', () => {
    render(NotesSearch, {
      props: { query: 'hello', filteredCount: 1, totalCount: 10 },
    });
    const input = screen.getByTestId<HTMLInputElement>('notes-search-input');
    expect(input.value).toBe('hello');
    // Clear button visible when input non-empty
    expect(screen.getByTestId('notes-search-clear')).toBeInTheDocument();
  });

  it('clear button resets the input value when clicked', async () => {
    render(NotesSearch, {
      props: { query: 'hello', filteredCount: 1, totalCount: 10 },
    });
    const input = screen.getByTestId<HTMLInputElement>('notes-search-input');
    const clear = screen.getByTestId('notes-search-clear');
    expect(input.value).toBe('hello');
    await fireEvent.click(clear);
    expect(input.value).toBe('');
    expect(screen.queryByTestId('notes-search-clear')).not.toBeInTheDocument();
  });

  it('Escape key clears the input when non-empty', async () => {
    render(NotesSearch, {
      props: { query: 'hello', filteredCount: 1, totalCount: 10 },
    });
    const input = screen.getByTestId<HTMLInputElement>('notes-search-input');
    expect(input.value).toBe('hello');
    await fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('');
    expect(screen.queryByTestId('notes-search-clear')).not.toBeInTheDocument();
  });

  it('Escape key is a no-op when input is empty', async () => {
    render(NotesSearch, {
      props: { query: '', filteredCount: 0, totalCount: 10 },
    });
    const input = screen.getByTestId<HTMLInputElement>('notes-search-input');
    expect(input.value).toBe('');
    // Should not throw or change anything.
    await fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('');
  });

  it('typing into input updates local value immediately (no debounce wait)', async () => {
    render(NotesSearch, {
      props: { query: '', filteredCount: 0, totalCount: 10 },
    });
    const input = screen.getByTestId<HTMLInputElement>('notes-search-input');
    await fireEvent.input(input, { target: { value: 'rus' } });
    expect(input.value).toBe('rus');
    // Clear button appears as soon as local has content.
    expect(screen.getByTestId('notes-search-clear')).toBeInTheDocument();
  });

  it('form has role=search and aria-label', () => {
    render(NotesSearch, {
      props: { query: '', filteredCount: 0, totalCount: 5 },
    });
    const form = screen.getByRole('search', { name: 'Search notes' });
    expect(form).toBeInTheDocument();
  });

  it('does not call debounce sync to query when value is unchanged (150ms guard)', async () => {
    vi.useFakeTimers();
    try {
      render(NotesSearch, {
        props: { query: 'hello', filteredCount: 1, totalCount: 10 },
      });
      const input = screen.getByTestId<HTMLInputElement>('notes-search-input');
      // Re-input the same value: schedule a sync; since the value matches
      // `query`, no write happens. We just verify nothing throws.
      await fireEvent.input(input, { target: { value: 'hello' } });
      vi.advanceTimersByTime(200);
      // Still stable.
      expect(input.value).toBe('hello');
    } finally {
      vi.useRealTimers();
    }
  });
});
