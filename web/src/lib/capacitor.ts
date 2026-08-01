/**
 * Capacitor plugin shim.
 *
 * On Android via Capacitor, real plugins (@capacitor/share, @capacitor/clipboard,
 * @capacitor/haptics) are injected via window.Capacitor.Plugins at runtime.
 * We don't statically import them in the web/ bundle because we want a single
 * tree-shakeable build that also works in a plain browser without Capacitor.
 *
 * In production: install the npm packages and switch to `import { Share } from '@capacitor/share'`
 * and call native APIs. For the v0.6.0 greenfield MVP, we use the dynamic
 * window.Capacitor.Plugins approach with safe web fallbacks.
 */

export interface CapacitorLike {
  isNativePlatform: () => boolean;
  getPlatform: () => string;
  Plugins: Record<string, unknown>;
}

declare global {
  interface Window {
    Capacitor?: CapacitorLike;
  }
}

export function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.Capacitor?.isNativePlatform?.());
}

export function getPlatform(): string {
  if (typeof window === 'undefined') return 'web';
  return window.Capacitor?.getPlatform?.() ?? 'web';
}

export interface ShareResult {
  activityType?: string;
}

export interface ClipboardWriteResult {
  value: string;
}

export interface ShareOptions {
  title?: string;
  text?: string;
  url?: string;
  dialogTitle?: string;
}

/**
 * Share text/url. Uses @capacitor/share on native, navigator.share on web, fallback to clipboard.
 */
export async function share(opts: ShareOptions): Promise<ShareResult | null> {
  if (typeof window === 'undefined') return null;
  const cap = window.Capacitor?.Plugins?.['Share'] as { share?: (o: ShareOptions) => Promise<ShareResult> } | undefined;
  if (cap?.share) {
    return cap.share(opts);
  }
  if (navigator.share) {
    try {
      await navigator.share(opts);
      return {};
    } catch {
      // user cancelled or unsupported
    }
  }
  // Fallback: copy to clipboard
  const text = [opts.title, opts.text, opts.url].filter(Boolean).join('\n');
  await copyToClipboard(text);
  return null;
}

export async function copyToClipboard(text: string): Promise<ClipboardWriteResult> {
  if (typeof window === 'undefined') return { value: text };
  const cap = window.Capacitor?.Plugins?.['Clipboard'] as { write?: (o: { string?: string }) => Promise<void> } | undefined;
  if (cap?.write) {
    await cap.write({ string: text });
    return { value: text };
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  }
  return { value: text };
}

export interface HapticsImpact {
  light?: boolean;
  medium?: boolean;
  heavy?: boolean;
}

export async function hapticImpact(style: HapticsImpact = { light: true }): Promise<void> {
  if (typeof window === 'undefined') return;
  const cap = window.Capacitor?.Plugins?.['Haptics'] as
    | { impact?: (o: { style: string }) => Promise<void> }
    | undefined;
  if (cap?.impact) {
    const map = { light: 'LIGHT', medium: 'MEDIUM', heavy: 'HEAVY' } as const;
    const k = style.heavy ? 'heavy' : style.medium ? 'medium' : 'light';
    await cap.impact({ style: map[k] });
    return;
  }
  if (navigator.vibrate) {
    navigator.vibrate(10);
  }
}

export function initCapacitor(): void {
  // No-op for now. Reserved for future: pre-warm plugins, status bar config, etc.
  // We intentionally don't call window.Capacitor.Plugins.<x> here to keep
  // main.ts sync and avoid surprising side effects in tests.
}
