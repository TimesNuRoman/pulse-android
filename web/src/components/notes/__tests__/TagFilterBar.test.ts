import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import TagFilterBar from '../TagFilterBar.svelte';

const sampleTags = [
  { tag: 'planning', count: 2 },
  { tag: 'design', count: 1 },
  { tag: 'editor', count: 1 },
];

describe('TagFilterBar', () => {
  afterEach(cleanup);

  it('renders nothing when there are no tags and no selection', () => {
    render(TagFilterBar, { props: { tags: [], selected: [], onChange: vi.fn() } });
    expect(screen.queryByTestId('tag-filter-bar')).not.toBeInTheDocument();
  });

  it('renders a chip for every provided tag with its count', () => {
    render(TagFilterBar, { props: { tags: sampleTags, selected: [], onChange: vi.fn() } });
    const bar = screen.getByTestId('tag-filter-bar');
    expect(bar).toBeInTheDocument();
    expect(screen.getByTestId('tag-chip-planning')).toBeInTheDocument();
    expect(screen.getByTestId('tag-chip-design')).toBeInTheDocument();
    expect(screen.getByTestId('tag-chip-editor')).toBeInTheDocument();
    // Count is rendered as a label sibling
    expect(bar.textContent).toContain('2');
  });

  it('tapping a chip calls onChange with the tag added to selected', async () => {
    const onChange = vi.fn();
    render(TagFilterBar, { props: { tags: sampleTags, selected: [], onChange } });
    await fireEvent.click(screen.getByTestId('tag-chip-planning'));
    expect(onChange).toHaveBeenCalledWith(['planning']);
  });

  it('tapping a selected chip calls onChange with it removed', async () => {
    const onChange = vi.fn();
    render(TagFilterBar, { props: { tags: sampleTags, selected: ['planning'], onChange } });
    await fireEvent.click(screen.getByTestId('tag-chip-planning'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('Clear button appears when something is selected and resets the filter', async () => {
    const onChange = vi.fn();
    render(TagFilterBar, { props: { tags: sampleTags, selected: ['planning'], onChange } });
    const clear = screen.getByTestId('tag-filter-clear');
    expect(clear).toBeInTheDocument();
    await fireEvent.click(clear);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('mark selected chip with data-selected=true', () => {
    render(TagFilterBar, { props: { tags: sampleTags, selected: ['design'], onChange: vi.fn() } });
    const design = screen.getByTestId('tag-chip-design');
    expect(design.getAttribute('data-selected')).toBe('true');
    const planning = screen.getByTestId('tag-chip-planning');
    expect(planning.getAttribute('data-selected')).toBe('false');
  });
});
