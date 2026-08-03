import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  saveBackupFile,
  pickBackupFile,
  readFileAsText,
} from '../backupFileSystem';

describe('saveBackupFile', () => {
  let originalCapacitor: unknown;
  beforeEach(() => {
    originalCapacitor = (window as Window & { Capacitor?: unknown }).Capacitor;
  });
  afterEach(() => {
    (window as Window & { Capacitor?: unknown }).Capacitor = originalCapacitor;
    vi.restoreAllMocks();
  });

  it('returns the expected shape on the web-download path', async () => {
    delete (window as Window & { Capacitor?: unknown }).Capacitor;
    const res = await saveBackupFile('{"hello":"world"}', 'pulse-notes-backup-2026-08-03.json');
    expect(res.filename).toBe('pulse-notes-backup-2026-08-03.json');
    expect(res.transport).toBe('web-download');
    expect(res.path).toBe('Downloads/pulse-notes-backup-2026-08-03.json');
  });

  it('uses the native share path when @capacitor/share is available', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    (window as Window & { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
      Plugins: { Share: { share } },
    };
    const res = await saveBackupFile('{"x":1}', 'backup.json');
    expect(share).toHaveBeenCalledTimes(1);
    expect(share.mock.calls[0][0].text).toBe('{"x":1}');
    expect(res.transport).toBe('native-share');
  });

  it('falls back to web-download when native share rejects', async () => {
    const share = vi.fn().mockRejectedValue(new Error('cancelled'));
    (window as Window & { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
      Plugins: { Share: { share } },
    };
    const res = await saveBackupFile('{"x":1}', 'backup.json');
    expect(share).toHaveBeenCalledTimes(1);
    expect(res.transport).toBe('web-download');
  });

  it('returns noop when window/document are unavailable', async () => {
    // Simulate non-browser env. `window` cannot be deleted in jsdom, so
    // `document` is stubbed to undefined instead. The function checks
    // for `document` first.
    const originalDocument = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = undefined;
    try {
      const res = await saveBackupFile('x', 'backup.json');
      expect(res.transport).toBe('noop');
    } finally {
      (globalThis as { document?: unknown }).document = originalDocument;
    }
  });
});

describe('pickBackupFile', () => {
  it('resolves with a File when the input change event fires', async () => {
    const fakeFile = new File(['{"a":1}'], 'pulse.json', { type: 'application/json' });
    const promise = pickBackupFile();
    // Allow the synchronous click + appendChild to settle.
    await Promise.resolve();
    await Promise.resolve();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    // Simulate file selection.
    Object.defineProperty(input!, 'files', {
      value: [fakeFile],
      configurable: true,
    });
    input!.dispatchEvent(new Event('change', { bubbles: true }));
    const got = await promise;
    expect(got).toBe(fakeFile);
  });

  it('cleans up the temporary input after a successful pick', async () => {
    const promise = pickBackupFile();
    await Promise.resolve();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    Object.defineProperty(input!, 'files', { value: [], configurable: true });
    input!.dispatchEvent(new Event('change', { bubbles: true }));
    await promise;
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });
});

describe('readFileAsText', () => {
  it('returns the text content of a File', async () => {
    const f = new File(['{"hello":"world"}'], 'backup.json', { type: 'application/json' });
    const text = await readFileAsText(f);
    expect(text).toBe('{"hello":"world"}');
  });
});
