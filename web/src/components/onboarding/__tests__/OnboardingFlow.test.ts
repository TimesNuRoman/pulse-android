import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import OnboardingFlow from '../OnboardingFlow.svelte';
import { onboardingStore } from '../onboardingStore';

describe('OnboardingFlow', () => {
  beforeEach(() => {
    localStorage.clear();
    onboardingStore.reset();
  });
  afterEach(cleanup);

  it('renders the flow on first launch (screen 0 = Welcome)', () => {
    render(OnboardingFlow, { props: { onComplete: vi.fn() } });
    expect(screen.getByTestId('onboarding-flow')).toBeInTheDocument();
    expect(screen.getByTestId('screen-welcome')).toBeInTheDocument();
    // Sibling panels are mounted but off-screen.
    expect(screen.getByTestId('onboarding-panel-3')).toBeInTheDocument();
  });

  it('Welcome CTA advances to Capture', async () => {
    render(OnboardingFlow, { props: { onComplete: vi.fn() } });
    await fireEvent.click(screen.getByTestId('welcome-cta'));
    expect(screen.getByTestId('onboarding-track').getAttribute('data-current')).toBe('1');
    expect(screen.getByTestId('screen-capture')).toBeInTheDocument();
  });

  it('Capture CTA advances to SmartEngine and shows skip link', async () => {
    render(OnboardingFlow, { props: { onComplete: vi.fn() } });
    await fireEvent.click(screen.getByTestId('welcome-cta'));
    expect(screen.getByTestId('capture-skip')).toBeInTheDocument();
    await fireEvent.click(screen.getByTestId('capture-cta'));
    expect(screen.getByTestId('onboarding-track').getAttribute('data-current')).toBe('2');
  });

  it('SmartEngine CTA advances to LocalFirst', async () => {
    render(OnboardingFlow, { props: { onComplete: vi.fn() } });
    await fireEvent.click(screen.getByTestId('welcome-cta'));
    await fireEvent.click(screen.getByTestId('capture-cta'));
    await fireEvent.click(screen.getByTestId('se3-cta'));
    expect(screen.getByTestId('onboarding-track').getAttribute('data-current')).toBe('3');
    expect(screen.getByTestId('screen-local-first')).toBeInTheDocument();
  });

  it('LocalFirst CTA completes the flow, fires onComplete, and persists', async () => {
    const onComplete = vi.fn();
    render(OnboardingFlow, { props: { onComplete } });
    await fireEvent.click(screen.getByTestId('welcome-cta'));
    await fireEvent.click(screen.getByTestId('capture-cta'));
    await fireEvent.click(screen.getByTestId('se3-cta'));
    await fireEvent.click(screen.getByTestId('lf-cta'));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('pulse.notes.onboarded')).toBe('true');
  });

  it('Skip on Capture jumps to the last screen without completing', async () => {
    const onComplete = vi.fn();
    render(OnboardingFlow, { props: { onComplete } });
    await fireEvent.click(screen.getByTestId('welcome-cta'));
    await fireEvent.click(screen.getByTestId('capture-skip'));
    expect(screen.getByTestId('onboarding-track').getAttribute('data-current')).toBe('3');
    expect(onComplete).not.toHaveBeenCalled();
    expect(localStorage.getItem('pulse.notes.onboarded')).toBeNull();
  });

  it('Skip on SmartEngine jumps to the last screen', async () => {
    render(OnboardingFlow, { props: { onComplete: vi.fn() } });
    await fireEvent.click(screen.getByTestId('welcome-cta'));
    await fireEvent.click(screen.getByTestId('capture-cta'));
    await fireEvent.click(screen.getByTestId('se3-skip'));
    expect(screen.getByTestId('onboarding-track').getAttribute('data-current')).toBe('3');
  });

  it('Clicking a progress dot jumps to that screen', async () => {
    render(OnboardingFlow, { props: { onComplete: vi.fn() } });
    await fireEvent.click(screen.getByTestId('progress-dot-2'));
    expect(screen.getByTestId('onboarding-track').getAttribute('data-current')).toBe('2');
  });

  it('Forwards when advancing, back when going to a lower index', async () => {
    render(OnboardingFlow, { props: { onComplete: vi.fn() } });
    await fireEvent.click(screen.getByTestId('welcome-cta'));
    expect(screen.getByTestId('onboarding-track').getAttribute('data-direction')).toBe('forward');
    await fireEvent.click(screen.getByTestId('progress-dot-0'));
    expect(screen.getByTestId('onboarding-track').getAttribute('data-direction')).toBe('back');
  });

  it('Welcome screen shows current APP_VERSION metadata and Apache 2.0 footer on last screen', async () => {
    render(OnboardingFlow, { props: { onComplete: vi.fn() } });
    // R95b — meta line now reads from APP_VERSION (currently 0.6.5), not a
    // hard-coded v0.6.2 string. This guard catches the next stale bump.
    const meta = screen.getByTestId('welcome-meta').textContent ?? '';
    expect(meta).toMatch(/v\d+\.\d+\.\d+/); // any semver-ish version
    expect(meta).not.toMatch(/v0\.6\.2/); // no stale v0.6.2 leaks
    expect(meta).toMatch(/Apache 2\.0/);
    await fireEvent.click(screen.getByTestId('welcome-cta'));
    await fireEvent.click(screen.getByTestId('capture-cta'));
    await fireEvent.click(screen.getByTestId('se3-cta'));
    expect(screen.getByTestId('lf-footer').textContent).toMatch(/Apache 2\.0/);
  });
});
