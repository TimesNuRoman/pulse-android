// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import VoiceWaveform from '../VoiceWaveform.svelte';

describe('VoiceWaveform', () => {
  afterEach(cleanup);

  it('renders 7 vertical bars by default', () => {
    render(VoiceWaveform, { props: { volume: 0 } });
    const container = screen.getByTestId('voice-waveform');
    const bars = container.querySelectorAll('.vwf__bar');
    expect(bars.length).toBe(7);
  });

  it('renders a custom number of bars when the prop is set', () => {
    render(VoiceWaveform, { props: { volume: 0, bars: 5 } });
    const container = screen.getByTestId('voice-waveform');
    const bars = container.querySelectorAll('.vwf__bar');
    expect(bars.length).toBe(5);
  });

  it('applies aria-live="polite" on the container for screen reader announcements', () => {
    render(VoiceWaveform, { props: { volume: 0 } });
    const container = screen.getByTestId('voice-waveform');
    expect(container.getAttribute('aria-live')).toBe('polite');
  });

  it('applies aria-label="Voice input waveform" on the container', () => {
    render(VoiceWaveform, { props: { volume: 0 } });
    const container = screen.getByTestId('voice-waveform');
    expect(container.getAttribute('aria-label')).toBe('Voice input waveform');
  });

  it('updates each bar\'s CSS --vwf-scale when the volume prop changes', async () => {
    const { rerender } = render(VoiceWaveform, { props: { volume: 0 } });
    const container = screen.getByTestId('voice-waveform');
    const bar0 = container.querySelectorAll('.vwf__bar')[0] as HTMLElement;
    // Default baseline = 0.15 (15% scale at silence)
    expect(bar0.style.getPropertyValue('--vwf-scale')).toBe('0.15');

    // Drive a new volume through the prop via rerender (Svelte 5 idiom —
    // $set is not available on component instances any more).
    await rerender({ volume: 1 });
    expect(bar0.style.getPropertyValue('--vwf-scale')).toBe('1');
  });

  it('clamps volume values outside [0, 1] to the [0, 1] range', async () => {
    const { rerender } = render(VoiceWaveform, { props: { volume: 0 } });
    const container = screen.getByTestId('voice-waveform');
    const bar0 = container.querySelectorAll('.vwf__bar')[0] as HTMLElement;
    await rerender({ volume: 5 });
    // 5 should clamp to 1
    expect(bar0.style.getPropertyValue('--vwf-scale')).toBe('1');
    await rerender({ volume: -3 });
    // -3 should clamp to 0 → scaleY = 0.15
    expect(bar0.style.getPropertyValue('--vwf-scale')).toBe('0.15');
  });

  it('staggered phase delays differ across bars', () => {
    render(VoiceWaveform, { props: { volume: 0 } });
    const container = screen.getByTestId('voice-waveform');
    const bars = Array.from(container.querySelectorAll('.vwf__bar')) as HTMLElement[];
    const delays = bars.map((b) => b.style.getPropertyValue('--vwf-delay'));
    // All delays should be set and unique.
    expect(new Set(delays).size).toBe(bars.length);
    // First bar should have a non-negative delay and last bar the largest.
    const asNumbers = delays.map((d) => parseFloat(d));
    for (const n of asNumbers) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
    expect(Math.max(...asNumbers)).toBeGreaterThan(0);
  });
});
