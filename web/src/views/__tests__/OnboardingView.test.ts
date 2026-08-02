// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import OnboardingView from '../OnboardingView.svelte';

const STORAGE_KEY = 'pulse.onboarded';

describe('OnboardingView', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(cleanup);

  it('slide navigation: Next advances, Back returns, current is reflected on the track', async () => {
    const onComplete = vi.fn();
    render(OnboardingView, { props: { onComplete } });

    // Starts on slide 0.
    const track = screen.getByTestId('onboarding-track');
    expect(track.style.getPropertyValue('--onboarding-offset')).toBe('0%');
    expect(screen.getByTestId('onboarding-panel-0')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-panel-1')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-panel-2')).toBeInTheDocument();

    // Back is disabled on slide 0.
    const back = screen.getByTestId('onboarding-prev') as HTMLButtonElement;
    expect(back.disabled).toBe(true);

    // Next → slide 1.
    await fireEvent.click(screen.getByTestId('onboarding-next'));
    expect(track.style.getPropertyValue('--onboarding-offset')).toBe('100%');
    expect(back.disabled).toBe(false);

    // Next → slide 2 (last) — CTA button appears.
    await fireEvent.click(screen.getByTestId('onboarding-next'));
    expect(track.style.getPropertyValue('--onboarding-offset')).toBe('200%');
    expect(screen.getByTestId('onboarding-cta')).toBeInTheDocument();

    // Back → slide 1.
    await fireEvent.click(screen.getByTestId('onboarding-prev'));
    expect(track.style.getPropertyValue('--onboarding-offset')).toBe('100%');

    // onComplete must NOT have fired during navigation.
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('skip: sets pulse.onboarded=true and fires onComplete', async () => {
    const onComplete = vi.fn();
    render(OnboardingView, { props: { onComplete } });

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    await fireEvent.click(screen.getByTestId('onboarding-skip'));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('completion: "Get started" on the last slide sets pulse.onboarded=true and fires onComplete', async () => {
    const onComplete = vi.fn();
    render(OnboardingView, { props: { onComplete } });

    // Advance to the last slide.
    await fireEvent.click(screen.getByTestId('onboarding-next'));
    await fireEvent.click(screen.getByTestId('onboarding-next'));
    expect(screen.getByTestId('onboarding-cta')).toBeInTheDocument();

    // localStorage is still unset — the Next clicks above must not have
    // persisted anything.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    // Click "Get started" → onComplete fires + flag is set.
    await fireEvent.click(screen.getByTestId('onboarding-cta'));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });
});
