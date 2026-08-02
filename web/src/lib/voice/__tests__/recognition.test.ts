// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isAvailable, start, stop } from '../recognition';

interface MockHandle {
  remove: ReturnType<typeof vi.fn>;
}

function makeHandle(): MockHandle {
  return { remove: vi.fn().mockResolvedValue(undefined) };
}

function setPlugin(impl: Partial<{
  available: () => Promise<{ available: boolean }>;
  start: (o: unknown) => Promise<void>;
  stop: () => Promise<void>;
  addListener: (e: string, l: (d: { matches: string[] }) => void) => MockHandle;
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
    const handle = makeHandle();
    const addListener = vi.fn().mockReturnValue(handle);
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
      addListener: vi.fn().mockReturnValue(makeHandle()),
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

  it('start() captures the listener handle and stop() detaches it (leak fix)', async () => {
    const handle = makeHandle();
    const startFn = vi.fn().mockResolvedValue(undefined);
    const stopFn = vi.fn().mockResolvedValue(undefined);
    const addListener = vi.fn().mockReturnValue(handle);
    setPlugin({ start: startFn, stop: stopFn, addListener });

    await start(vi.fn(), vi.fn());
    expect(addListener).toHaveBeenCalledTimes(1);
    expect(handle.remove).not.toHaveBeenCalled();

    await stop();
    // stop() must call .remove() exactly once on the handle start() registered.
    expect(handle.remove).toHaveBeenCalledTimes(1);
  });

  it('start() is idempotent — second start() removes the previous listener before re-registering', async () => {
    const handle1 = makeHandle();
    const handle2 = makeHandle();
    const addListener = vi.fn().mockReturnValueOnce(handle1).mockReturnValueOnce(handle2);
    setPlugin({
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      addListener,
    });

    await start(vi.fn(), vi.fn());
    await start(vi.fn(), vi.fn());

    expect(addListener).toHaveBeenCalledTimes(2);
    // First handle was removed when the second start() ran (idempotency).
    expect(handle1.remove).toHaveBeenCalledTimes(1);
    // Second handle is still alive at this point.
    expect(handle2.remove).not.toHaveBeenCalled();

    // After stop(), only the second (most recent) handle is detached.
    await stop();
    expect(handle1.remove).toHaveBeenCalledTimes(1);
    expect(handle2.remove).toHaveBeenCalledTimes(1);
  });

  it('start() x2 then stop() x1 does not throw and cleans up both handles', async () => {
    const handle1 = makeHandle();
    const handle2 = makeHandle();
    const addListener = vi.fn().mockReturnValueOnce(handle1).mockReturnValueOnce(handle2);
    setPlugin({
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      addListener,
    });

    await start(vi.fn(), vi.fn());
    await start(vi.fn(), vi.fn());
    await expect(stop()).resolves.toBeUndefined();

    // First handle removed at the second start(), second handle removed at stop().
    expect(handle1.remove).toHaveBeenCalledTimes(1);
    expect(handle2.remove).toHaveBeenCalledTimes(1);
  });

  it('stop() swallows errors thrown by listener.remove()', async () => {
    const handle = makeHandle();
    handle.remove.mockRejectedValue(new Error('already detached'));
    setPlugin({
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      addListener: vi.fn().mockReturnValue(handle),
    });

    await start(vi.fn(), vi.fn());
    await expect(stop()).resolves.toBeUndefined();
    expect(handle.remove).toHaveBeenCalledTimes(1);
  });

  it('stop() with no prior start() does not throw (no handle to remove)', async () => {
    setPlugin({ stop: vi.fn().mockResolvedValue(undefined) });
    await expect(stop()).resolves.toBeUndefined();
  });
});
