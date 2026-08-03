/**
 * Backup / restore — file-system adapter.
 *
 * Bridges the pure backup core (`backupRestore.ts`) to whichever file
 * transport is available in the current runtime. Two paths are supported:
 *
 *  - **Web (and Android WebView)**: standard `<a download>` + `Blob`. The
 *    Android Capacitor WebView routes this through the system
 *    DownloadManager and the file lands in the public `Downloads/` folder.
 *  - **Native Capacitor**: if `@capacitor/share` is available at runtime
 *    (injected by Capacitor.Plugins), the JSON is passed through the
 *    native share sheet as a `File`. This is a best-effort convenience
 *    that lets the user choose where the file goes (Drive, Files, mail,
 *    etc.) without us having to install `@capacitor/filesystem`.
 *
 * For import, a hidden `<input type="file">` is used in both runtimes.
 * The Android WebView's file picker handles the user interaction
 * natively. No Capacitor Filesystem plugin is required.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SaveBackupResult {
  /** Best-effort display path or target (e.g. "Downloads/backup.json"). */
  path?: string;
  filename: string;
  /** Which transport actually wrote the file. */
  transport: 'web-download' | 'native-share' | 'noop';
}

/**
 * Trigger a save of `json` to `filename`. Returns the transport used and
 * a best-effort display path. The function never rejects on user
 * cancellation of the share sheet (returns `transport: 'native-share'`
 * with no `path`).
 */
export async function saveBackupFile(
  json: string,
  filename: string,
): Promise<SaveBackupResult> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { filename, transport: 'noop' };
  }

  // 1) Native share path (lets the user pick Drive / Files / etc.).
  //    Same pattern as noteExport.ts: route through Capacitor.Plugins.Share
  //    when it's available, otherwise fall through.
  const cap = window.Capacitor?.Plugins?.['Share'] as
    | { share?: (o: { title?: string; text?: string; dialogTitle?: string }) => Promise<unknown> }
    | undefined;
  if (cap?.share) {
    try {
      await cap.share({
        title: filename,
        text: json,
        dialogTitle: 'Save backup as JSON',
      });
      return { filename, transport: 'native-share' };
    } catch {
      // user cancelled — fall back to web download
    }
  }

  // 2) Web anchor + blob download. Works in plain browsers and in the
  //    Android WebView (system DownloadManager takes it from there).
  triggerBrowserDownload(json, filename);
  return { path: `Downloads/${filename}`, filename, transport: 'web-download' };
}

/**
 * Open a file picker and resolve to a `File` (or `null` if the user
 * cancelled). The picker uses a hidden `<input type="file">` in both
 * web and Android WebView.
 */
export function pickBackupFile(): Promise<File | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.position = 'fixed';
    input.style.top = '-1000px';
    input.style.left = '-1000px';
    input.style.opacity = '0';
    let settled = false;
    const cleanup = (): void => {
      if (input.parentNode) input.parentNode.removeChild(input);
    };
    const settle = (value: File | null): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    input.addEventListener('change', () => {
      const f = input.files && input.files.length > 0 ? input.files[0] : null;
      settle(f);
    });
    // Some browsers fire `cancel` when the dialog is dismissed without
    // a selection. `change` does NOT fire in that case.
    const win = window as Window & { addEventListener?: (k: string, l: (e: Event) => void) => void };
    if (typeof win.addEventListener === 'function') {
      const onFocus = (): void => {
        // Defer the cancel check so the change handler has a chance to
        // fire first if a file was selected.
        setTimeout(() => settle(null), 1000);
        window.removeEventListener('focus', onFocus);
      };
      window.addEventListener('focus', onFocus);
    }
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Read a `File`'s contents as a UTF-8 string. Rejects on read error.
 */
export function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (): void => {
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result);
      } else {
        reject(new Error('Unexpected FileReader result type'));
      }
    };
    reader.onerror = (): void => {
      reject(reader.error ?? new Error('FileReader error'));
    };
    reader.readAsText(file, 'utf-8');
  });
}

// --- internal helpers -------------------------------------------------------

function triggerBrowserDownload(content: string, filename: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return;
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}
