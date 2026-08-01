import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import ProgressDots from '../ProgressDots.svelte';

describe('ProgressDots', () => {
  afterEach(cleanup);

  it('renders 4 dots by default (SCREEN_COUNT)', () => {
    render(ProgressDots, { props: { current: 0 as 0 } });
    const dots = screen.getAllByRole('button', { name: /Go to screen/ });
    expect(dots.length).toBe(4);
  });

  it('renders a custom total when provided', () => {
    render(ProgressDots, { props: { current: 0 as 0, total: 6 } });
    const dots = screen.getAllByRole('button', { name: /Go to screen/ });
    expect(dots.length).toBe(6);
  });

  it('marks the current dot with data-active=true and aria-current=step', () => {
    render(ProgressDots, { props: { current: 2 as 2 } });
    const active = screen.getByTestId('progress-dot-2');
    expect(active.getAttribute('data-active')).toBe('true');
    expect(active.getAttribute('aria-current')).toBe('step');
    const others = ['progress-dot-0', 'progress-dot-1', 'progress-dot-3'];
    for (const id of others) {
      expect(screen.getByTestId(id).getAttribute('data-active')).toBe('false');
    }
  });

  it('invokes onDotClick with the clicked index', async () => {
    const onDotClick = vi.fn();
    render(ProgressDots, { props: { current: 0 as 0, onDotClick } });
    await fireEvent.click(screen.getByTestId('progress-dot-3'));
    expect(onDotClick).toHaveBeenCalledTimes(1);
    expect(onDotClick).toHaveBeenCalledWith(3);
  });

  it('does not throw when onDotClick is not provided', async () => {
    render(ProgressDots, { props: { current: 0 as 0 } });
    await fireEvent.click(screen.getByTestId('progress-dot-1'));
    // No assertion — the test passes if no throw occurs.
    expect(screen.getByTestId('progress-dot-1')).toBeInTheDocument();
  });

  it('exposes an accessible nav with progress aria-label', () => {
    render(ProgressDots, { props: { current: 1 as 1 } });
    const nav = screen.getByTestId('progress-dots');
    expect(nav.tagName.toLowerCase()).toBe('nav');
    expect(nav.getAttribute('aria-label')).toMatch(/Onboarding progress \(2 of 4\)/);
  });
});
