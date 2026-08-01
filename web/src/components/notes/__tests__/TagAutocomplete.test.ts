import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import TagAutocomplete from '../TagAutocomplete.svelte';

const tags = [
  { tag: 'rust', count: 12 },
  { tag: 'react', count: 8 },
  { tag: 'smart-engine', count: 5 },
  { tag: 'ai-native', count: 3 },
  { tag: 'rust-borrow-checker', count: 1 },
  { tag: 'wasm', count: 2 },
];

describe('TagAutocomplete', () => {
  afterEach(cleanup);

  it('does not render when open=false', () => {
    render(TagAutocomplete, {
      props: { open: false, query: '', tags, onSelect: vi.fn(), onDismiss: vi.fn() },
    });
    expect(screen.queryByTestId('tag-autocomplete')).not.toBeInTheDocument();
  });

  it('renders when open=true', () => {
    render(TagAutocomplete, {
      props: { open: true, query: '', tags, onSelect: vi.fn(), onDismiss: vi.fn() },
    });
    expect(screen.getByTestId('tag-autocomplete')).toBeInTheDocument();
  });

  it('hides when no tags match the query', () => {
    render(TagAutocomplete, {
      props: { open: true, query: 'zzz', tags, onSelect: vi.fn(), onDismiss: vi.fn() },
    });
    expect(screen.queryByTestId('tag-autocomplete')).not.toBeInTheDocument();
  });

  it('filters by substring (fuzzy)', () => {
    render(TagAutocomplete, {
      props: { open: true, query: 'rus', tags, onSelect: vi.fn(), onDismiss: vi.fn() },
    });
    expect(screen.getByTestId('tag-suggestion-rust')).toBeInTheDocument();
    expect(screen.getByTestId('tag-suggestion-rust-borrow-checker')).toBeInTheDocument();
    expect(screen.queryByTestId('tag-suggestion-react')).not.toBeInTheDocument();
  });

  it('prioritizes prefix matches over substring', () => {
    // For query="rust", exact prefix "rust" should come before "rust-borrow-checker"
    const { container } = render(TagAutocomplete, {
      props: { open: true, query: 'rust', tags, onSelect: vi.fn(), onDismiss: vi.fn() },
    });
    const items = container.querySelectorAll('[role="option"]');
    expect(items[0]?.getAttribute('data-tag')).toBe('rust');
    expect(items[1]?.getAttribute('data-tag')).toBe('rust-borrow-checker');
  });

  it('sorts by usage count when no query', () => {
    const { container } = render(TagAutocomplete, {
      props: { open: true, query: '', tags, onSelect: vi.fn(), onDismiss: vi.fn() },
    });
    const items = container.querySelectorAll('[role="option"]');
    // rust=12, react=8, smart-engine=5, ai-native=3, wasm=2, rust-borrow-checker=1
    expect(items[0]?.getAttribute('data-tag')).toBe('rust');
    expect(items[1]?.getAttribute('data-tag')).toBe('react');
  });

  it('limits to 8 results', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ tag: `tag${i}`, count: 20 - i }));
    const { container } = render(TagAutocomplete, {
      props: { open: true, query: '', tags: many, onSelect: vi.fn(), onDismiss: vi.fn() },
    });
    const items = container.querySelectorAll('[role="option"]');
    expect(items.length).toBe(8);
  });

  it('calls onSelect with tag when clicked', async () => {
    const onSelect = vi.fn();
    render(TagAutocomplete, {
      props: { open: true, query: '', tags, onSelect, onDismiss: vi.fn() },
    });
    await fireEvent.click(screen.getByTestId('tag-suggestion-rust').querySelector('button')!);
    expect(onSelect).toHaveBeenCalledWith('rust');
  });

  it('Enter key selects the active item', async () => {
    const onSelect = vi.fn();
    render(TagAutocomplete, {
      props: { open: true, query: '', tags, onSelect, onDismiss: vi.fn() },
    });
    // First item (activeIndex=0) is 'rust' (highest count)
    await fireEvent.keyDown(window, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('rust');
  });

  it('ArrowDown moves active index, Enter selects the new one', async () => {
    const onSelect = vi.fn();
    render(TagAutocomplete, {
      props: { open: true, query: '', tags, onSelect, onDismiss: vi.fn() },
    });
    await fireEvent.keyDown(window, { key: 'ArrowDown' });
    await fireEvent.keyDown(window, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('react');
  });

  it('ArrowUp wraps to last item', async () => {
    const onSelect = vi.fn();
    render(TagAutocomplete, {
      props: { open: true, query: '', tags, onSelect, onDismiss: vi.fn() },
    });
    await fireEvent.keyDown(window, { key: 'ArrowUp' });
    await fireEvent.keyDown(window, { key: 'Enter' });
    // Active=0, ArrowUp -> last visible (limited to 8). We have 6 tags, so last = 'rust-borrow-checker'.
    expect(onSelect).toHaveBeenCalledWith('rust-borrow-checker');
  });

  it('Escape calls onDismiss', async () => {
    const onDismiss = vi.fn();
    render(TagAutocomplete, {
      props: { open: true, query: '', tags, onSelect: vi.fn(), onDismiss },
    });
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('marks active item with aria-selected=true', () => {
    render(TagAutocomplete, {
      props: { open: true, query: '', tags, onSelect: vi.fn(), onDismiss: vi.fn() },
    });
    const first = screen.getByTestId('tag-suggestion-rust');
    expect(first).toHaveAttribute('aria-selected', 'true');
  });

  it('renders counts next to each tag', () => {
    render(TagAutocomplete, {
      props: { open: true, query: '', tags, onSelect: vi.fn(), onDismiss: vi.fn() },
    });
    expect(screen.getByLabelText('12 notes')).toBeInTheDocument();
  });
});
