import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import SplitPaneTest from './SplitPaneTestWrapper.svelte';

describe('SplitPane', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(cleanup);

  it('renders two panes', () => {
    render(SplitPaneTest, { props: { mode: 'desktop' } });
    expect(screen.getByTestId('split-pane-first')).toBeInTheDocument();
    expect(screen.getByTestId('split-pane-second')).toBeInTheDocument();
  });

  it('shows drag handle on desktop, mobile toggle on mobile', () => {
    const { unmount } = render(SplitPaneTest, { props: { mode: 'desktop' } });
    expect(screen.getByTestId('split-pane-handle')).toBeInTheDocument();
    expect(screen.queryByTestId('split-pane-mobile-toggle')).not.toBeInTheDocument();
    unmount();
    render(SplitPaneTest, { props: { mode: 'mobile' } });
    expect(screen.queryByTestId('split-pane-handle')).not.toBeInTheDocument();
    expect(screen.getByTestId('split-pane-mobile-toggle')).toBeInTheDocument();
  });

  it('data-mode reflects forceMode', () => {
    const { container } = render(SplitPaneTest, { props: { mode: 'mobile' } });
    const root = container.querySelector('[data-testid="split-pane"]')!;
    expect(root.getAttribute('data-mode')).toBe('mobile');
  });

  it('reflects initialRatio in data-ratio', () => {
    const { container } = render(SplitPaneTest, { props: { mode: 'desktop', ratio: 0.7 } });
    const root = container.querySelector('[data-testid="split-pane"]')!;
    expect(Number(root.getAttribute('data-ratio'))).toBeCloseTo(0.7, 5);
  });

  it('emits onRatioChange when handle is dragged', async () => {
    const onRatioChange = vi.fn();
    const { container } = render(SplitPaneTest, { props: { mode: 'desktop', onRatioChange } });
    const root = container.querySelector('[data-testid="split-pane"]') as HTMLElement;
    // Stub getBoundingClientRect
    root.getBoundingClientRect = () => ({
      x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 800,
      width: 1000, height: 800, toJSON: () => ({}),
    });
    const handle = screen.getByTestId('split-pane-handle');
    // Simulate pointer drag: down at handle, move to 70% across the pane, up
    await fireEvent.pointerDown(handle, { clientX: 500, clientY: 400, pointerId: 1 });
    await fireEvent.pointerMove(root, { clientX: 700, clientY: 400, pointerId: 1 });
    await fireEvent.pointerUp(root, { clientX: 700, clientY: 400, pointerId: 1 });
    expect(onRatioChange).toHaveBeenCalled();
    const lastCall = onRatioChange.mock.calls[onRatioChange.mock.calls.length - 1]?.[0];
    expect(lastCall).toBeCloseTo(0.7, 1);
  });

  it('clamps ratio to min/max', async () => {
    const onRatioChange = vi.fn();
    const { container } = render(SplitPaneTest, {
      props: { mode: 'desktop', onRatioChange, minRatio: 0.3, maxRatio: 0.7, ratio: 0.5 },
    });
    const root = container.querySelector('[data-testid="split-pane"]') as HTMLElement;
    root.getBoundingClientRect = () => ({
      x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 800,
      width: 1000, height: 800, toJSON: () => ({}),
    });
    const handle = screen.getByTestId('split-pane-handle');
    await fireEvent.pointerDown(handle, { clientX: 500, clientY: 400, pointerId: 2 });
    await fireEvent.pointerMove(root, { clientX: 50, clientY: 400, pointerId: 2 });
    await fireEvent.pointerUp(root, { clientX: 50, clientY: 400, pointerId: 2 });
    // Ratio should be clamped to 0.3 (minRatio), not 0.05
    const lastCall = onRatioChange.mock.calls[onRatioChange.mock.calls.length - 1]?.[0];
    expect(lastCall).toBeCloseTo(0.3, 5);
  });

  it('mobile toggle swaps ratio between 0.05 and 0.95', async () => {
    const onRatioChange = vi.fn();
    render(SplitPaneTest, { props: { mode: 'mobile', onRatioChange } });
    const toggle = screen.getByTestId('split-pane-mobile-toggle');
    await fireEvent.click(toggle);
    expect(onRatioChange).toHaveBeenLastCalledWith(0.95);
    await fireEvent.click(toggle);
    expect(onRatioChange).toHaveBeenLastCalledWith(0.05);
  });

  it('persists ratio to localStorage when persistKey is set', async () => {
    const onRatioChange = vi.fn();
    const { container } = render(SplitPaneTest, {
      props: { mode: 'desktop', onRatioChange, persistKey: 'test-split', ratio: 0.5 },
    });
    const root = container.querySelector('[data-testid="split-pane"]') as HTMLElement;
    root.getBoundingClientRect = () => ({
      x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 800,
      width: 1000, height: 800, toJSON: () => ({}),
    });
    const handle = screen.getByTestId('split-pane-handle');
    await fireEvent.pointerDown(handle, { clientX: 500, clientY: 400, pointerId: 3 });
    await fireEvent.pointerMove(root, { clientX: 600, clientY: 400, pointerId: 3 });
    await fireEvent.pointerUp(root, { clientX: 600, clientY: 400, pointerId: 3 });
    expect(localStorage.getItem('test-split')).toBeTruthy();
    const stored = Number(localStorage.getItem('test-split'));
    expect(stored).toBeGreaterThan(0.5);
  });

  it('restores ratio from localStorage on mount', () => {
    localStorage.setItem('split-test', '0.42');
    const { container } = render(SplitPaneTest, {
      props: { mode: 'desktop', persistKey: 'split-test', ratio: 0.5 },
    });
    const root = container.querySelector('[data-testid="split-pane"]')!;
    expect(Number(root.getAttribute('data-ratio'))).toBeCloseTo(0.42, 5);
  });

  it('does not restore out-of-range value', () => {
    localStorage.setItem('split-test', '1.5');
    const { container } = render(SplitPaneTest, {
      props: { mode: 'desktop', persistKey: 'split-test', ratio: 0.5, maxRatio: 0.8 },
    });
    const root = container.querySelector('[data-testid="split-pane"]')!;
    expect(Number(root.getAttribute('data-ratio'))).toBeCloseTo(0.5, 5);
  });

  it('exposes role=separator on the handle', () => {
    render(SplitPaneTest, { props: { mode: 'desktop' } });
    const handle = screen.getByRole('separator');
    expect(handle).toBeInTheDocument();
  });

  it('handle has aria-valuenow/aria-valuemin/aria-valuemax', () => {
    render(SplitPaneTest, { props: { mode: 'desktop', ratio: 0.5 } });
    const handle = screen.getByTestId('split-pane-handle');
    expect(handle).toHaveAttribute('aria-valuenow', '50');
    expect(handle).toHaveAttribute('aria-valuemin', '20');
    expect(handle).toHaveAttribute('aria-valuemax', '80');
  });

  it('double-click handle resets to initialRatio', async () => {
    const onRatioChange = vi.fn();
    const { container } = render(SplitPaneTest, { props: { mode: 'desktop', onRatioChange, ratio: 0.5 } });
    const root = container.querySelector('[data-testid="split-pane"]') as HTMLElement;
    root.getBoundingClientRect = () => ({
      x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 800,
      width: 1000, height: 800, toJSON: () => ({}),
    });
    const handle = screen.getByTestId('split-pane-handle');
    await fireEvent.pointerDown(handle, { clientX: 500, clientY: 400, pointerId: 4 });
    await fireEvent.pointerMove(root, { clientX: 800, clientY: 400, pointerId: 4 });
    await fireEvent.pointerUp(root, { clientX: 800, clientY: 400, pointerId: 4 });
    await fireEvent.dblClick(handle);
    expect(onRatioChange).toHaveBeenLastCalledWith(0.5);
  });
});
