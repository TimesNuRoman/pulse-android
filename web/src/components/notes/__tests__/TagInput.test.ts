import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import TagInput from '../TagInput.svelte';

describe('TagInput', () => {
  afterEach(cleanup);

  it('renders with the given placeholder and empty value', () => {
    render(TagInput, { props: { existingTags: [], placeholder: 'add tag…' } });
    const input = screen.getByTestId('tag-input') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.placeholder).toBe('add tag…');
    expect(input.value).toBe('');
  });

  it('Enter on a single tag calls onAdd with [tag]', async () => {
    const onAdd = vi.fn();
    render(TagInput, { props: { existingTags: [], onAdd } });
    const input = screen.getByTestId('tag-input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'work' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith(['work']);
    expect(input.value).toBe('');
  });

  it('Enter on comma-separated input calls onAdd with multiple tags', async () => {
    const onAdd = vi.fn();
    render(TagInput, { props: { existingTags: [], onAdd } });
    const input = screen.getByTestId('tag-input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'work, urgent' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledWith(['work', 'urgent']);
  });

  it('Enter on #-prefixed shorthand normalizes the tags', async () => {
    const onAdd = vi.fn();
    render(TagInput, { props: { existingTags: [], onAdd } });
    const input = screen.getByTestId('tag-input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: '#work #URGENT' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledWith(['work', 'urgent']);
  });

  it('rejects invalid characters and does not call onAdd', async () => {
    const onAdd = vi.fn();
    render(TagInput, { props: { existingTags: [], onAdd } });
    const input = screen.getByTestId('tag-input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'bad!' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('dedupes against existing tags', async () => {
    const onAdd = vi.fn();
    render(TagInput, { props: { existingTags: ['work'], onAdd } });
    const input = screen.getByTestId('tag-input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'work, idea' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    // 'work' is in existingTags, so only 'idea' is emitted.
    expect(onAdd).toHaveBeenCalledWith(['idea']);
  });

  it('Backspace on empty input calls onRemove with the last existing tag', async () => {
    const onRemove = vi.fn();
    render(TagInput, { props: { existingTags: ['a', 'b', 'c'], onRemove } });
    const input = screen.getByTestId('tag-input') as HTMLInputElement;
    await fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onRemove).toHaveBeenCalledWith('c');
  });
});
