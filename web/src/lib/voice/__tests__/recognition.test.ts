// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isAvailable, start, stop } from '../recognition';

function setPlugin(impl: Partial<{
  available: () => Promise<{ available: boolean }>;
  start: (o: unknown) => Promise<void>;
  stop: () => Promise<void>;
  addListener: (e: string, l: (d: { matches: string[] }) => void) => void;
}>): void {
  (window as unknown as { Capacitor: unknown }).Capacitor = {
    Plugins: { SpeechRecognition: impl },
  };
}

function clearPlugin(): void {
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
}

describe('voice/recognition', () => {
  beforeEach(() => {
    clearPlugin();
  });

  afterEach(() => {
    clearPlugin();
  });

  it('isAvailable() returns true when the plugin reports available', async () => {
    setPlugin({ available: vi.fn().mockResolvedValue({ available: true }) });
    await expect(isAvailable()).resolves.toBe(true);
  });

  it('isAvailable() returns false when the plugin is missing', async () => {
    clearPlugin();
    await expect(isAvailable()).resolves.toBe(false);
  });

  it('isAvailable() returns false when available() throws', async () => {
    setPlugin({ available: vi.fn().mockRejectedValue(new Error('boom')) });
    await expect(isAvailable()).resolves.toBe(false);
  });

  it('start() calls the plugin with the right options and wires the listener', async () => {
    const startFn = vi.fn().mockResolvedValue(undefined);
    const addListener = vi.fn();
    setPlugin({ start: startFn, addListener });

    const onResult = vi.fn();
    const onError = vi.fn();
    await start(onResult, onError);

    expect(startFn).toHaveBeenCalledTimes(1);
    const opts = startFn.mock.calls[0][0] as Record<string, unknown>;
    expect(opts.language).toBeTruthy();
    expect(opts.maxResults).toBe(1);
    expect(opts.partialResults).toBe(true);
    expect(opts.popup).toBe(false);
    expect(addListener).toHaveBeenCalledWith('partialResults', expect.any(Function));

    // Simulate a partial result arriving on the registered listener.
    const cb = addListener.mock.calls[0][1] as (d: { matches: string[] }) => void;
    cb({ matches: ['hello world'] });
    expect(onResult).toHaveBeenCalledWith({ text: 'hello world', isFinal: false });
    expect(onError).not.toHaveBeenCalled();
  });

  it('start() reports an error when the plugin is missing', async () => {
    clearPlugin();
    const onError = vi.fn();
    await start(vi.fn(), onError);
    expect(onError).toHaveBeenCalledWith('SpeechRecognition plugin not available');
  });

  it('start() reports an error when plugin.start() rejects', async () => {
    setPlugin({
      start: vi.fn().mockRejectedValue(new Error('permission denied')),
      addListener: vi.fn(),
    });
    const onError = vi.fn();
    await start(vi.fn(), onError);
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('permission denied'));
  });

  it('stop() calls the plugin and swallows errors silently', async () => {
    const stopFn = vi.fn().mockRejectedValue(new Error('race'));
    setPlugin({ stop: stopFn });
    await expect(stop()).resolves.toBeUndefined();
    expect(stopFn).toHaveBeenCalledTimes(1);
  });

  it('stop() is a no-op when the plugin is missing', async () => {
    clearPlugin();
    await expect(stop()).resolves.toBeUndefined();
  });
});
