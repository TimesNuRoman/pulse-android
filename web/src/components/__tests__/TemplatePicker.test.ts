// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import TemplatePicker from '../TemplatePicker.svelte';

describe('TemplatePicker', () => {
  afterEach(cleanup);

  it('does not render when open=false', () => {
    render(TemplatePicker, {
      props: { open: false, onpick: vi.fn(), ondismiss: vi.fn() },
    });
    expect(screen.queryByTestId('template-picker')).not.toBeInTheDocument();
  });

  it('renders 5 template options when open', () => {
    render(TemplatePicker, {
      props: { open: true, onpick: vi.fn(), ondismiss: vi.fn() },
    });
    const list = screen.getByTestId('template-picker');
    expect(list).toBeInTheDocument();
    expect(list).toHaveAttribute('role', 'listbox');
    const options = screen.getAllByRole('option');
    expect(options.length).toBe(5);
  });

  it('marks the first option as selected on open', () => {
    render(TemplatePicker, {
      props: { open: true, onpick: vi.fn(), ondismiss: vi.fn() },
    });
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(options[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('exposes data-template-id on each option', () => {
    const { container } = render(TemplatePicker, {
      props: { open: true, onpick: vi.fn(), ondismiss: vi.fn() },
    });
    const ids = Array.from(
      container.querySelectorAll<HTMLElement>('[data-template-id]'),
    ).map((el) => el.getAttribute('data-template-id'));
    expect(ids).toEqual(['meeting', 'todo', 'journal', 'code', 'reading']);
  });

  it('clicking an option fires onpick with the template', async () => {
    const onpick = vi.fn();
    render(TemplatePicker, {
      props: { open: true, onpick, ondismiss: vi.fn() },
    });
    await fireEvent.click(screen.getByTestId('template-option-todo'));
    expect(onpick).toHaveBeenCalledTimes(1);
    const arg = onpick.mock.calls[0]?.[0];
    expect(arg?.id).toBe('todo');
    expect(arg?.name).toBe('TODO');
  });

  it('ArrowDown moves the active selection', async () => {
    render(TemplatePicker, {
      props: { open: true, onpick: vi.fn(), ondismiss: vi.fn() },
    });
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    await fireEvent.keyDown(window, { key: 'ArrowDown' });
    const after = screen.getAllByRole('option');
    expect(after[0]).toHaveAttribute('aria-selected', 'false');
    expect(after[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('ArrowUp wraps from the first option to the last', async () => {
    render(TemplatePicker, {
      props: { open: true, onpick: vi.fn(), ondismiss: vi.fn() },
    });
    await fireEvent.keyDown(window, { key: 'ArrowUp' });
    const options = screen.getAllByRole('option');
    expect(options[options.length - 1]).toHaveAttribute('aria-selected', 'true');
  });

  it('Enter on the first option fires onpick with the meeting template', async () => {
    const onpick = vi.fn();
    render(TemplatePicker, {
      props: { open: true, onpick, ondismiss: vi.fn() },
    });
    await fireEvent.keyDown(window, { key: 'Enter' });
    expect(onpick).toHaveBeenCalledTimes(1);
    expect(onpick.mock.calls[0]?.[0]?.id).toBe('meeting');
  });

  it('Escape calls ondismiss', async () => {
    const ondismiss = vi.fn();
    render(TemplatePicker, {
      props: { open: true, onpick: vi.fn(), ondismiss },
    });
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(ondismiss).toHaveBeenCalledTimes(1);
  });

  it('pointerdown outside the picker calls ondismiss', async () => {
    const ondismiss = vi.fn();
    render(TemplatePicker, {
      props: { open: true, onpick: vi.fn(), ondismiss },
    });
    // Click on document body (outside the picker)
    await fireEvent.pointerDown(document.body);
    expect(ondismiss).toHaveBeenCalled();
  });

  it('pointerdown inside the picker does NOT call ondismiss', async () => {
    const ondismiss = vi.fn();
    render(TemplatePicker, {
      props: { open: true, onpick: vi.fn(), ondismiss },
    });
    const opt = screen.getByTestId('template-option-meeting');
    await fireEvent.pointerDown(opt);
    expect(ondismiss).not.toHaveBeenCalled();
  });

  it('renders an inline SVG icon (not text emoji) for each template', () => {
    const { container } = render(TemplatePicker, {
      props: { open: true, onpick: vi.fn(), ondismiss: vi.fn() },
    });
    // Every option must contain an <svg>, no text-emoji characters.
    const options = container.querySelectorAll('[data-template-id]');
    for (const opt of Array.from(options)) {
      expect(opt.querySelector('svg')).not.toBeNull();
    }
    const text = container.textContent ?? '';
    // Brief hard rule 7: no emoji in UI
    expect(text).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(text).not.toMatch(/[\u{2600}-\u{27BF}]/u);
  });
});
