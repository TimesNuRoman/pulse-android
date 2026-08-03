<!--
  UpdateBanner — non-blocking in-app update notice.

  Renders at the top of NotesView when checkForUpdate() reports an
  available update. Three visual states:

    1. Normal (currentVersion >= force_update_below)
       Blue-tinted Tokyo Night card, "Update available vX.Y.Z",
       a "Get it" button that opens the download URL, and a × dismiss.

    2. Force (currentVersion < force_update_below)
       Red-tinted card, "Required update vX.Y.Z", "Get it" only.
       The × dismiss is hidden — the user must update or close the app.

    3. Dismissed (× clicked for this latestVersion)
       The banner does not render. The dismiss flag is per-version:
       dismissing v0.6.7 does not hide a future v0.6.8 banner.

  aria-live="polite" so screen readers announce when the banner
  appears (and when it disappears via dismiss). Get it button is
  56dp tall to clear the M3 touch-target recommendation.

  Anti-emoji policy: no emoji codepoints in copy or icons. Decorative
  SVG is fine (geometric, not pictographic).
-->
<script lang="ts">
  import type { UpdateInfo } from '../lib/updateChecker';
  import { isDismissedFor, dismissFor } from '../lib/updateChecker';

  interface Props {
    info: UpdateInfo;
    currentVersion: string;
    /**
     * Override for the "Get it" handler. When omitted, the banner
     * opens the download URL via window.Capacitor?.Plugins?.Browser
     * (the project's existing pattern — see lib/capacitor.ts) and
     * falls back to window.open / location.href on plain web.
     */
    onGetIt?: (info: UpdateInfo) => void;
  }

  let { info, currentVersion, onGetIt }: Props = $props();

  // Dismiss state — keyed by latestVersion. Re-renders on a version
  // bump. Local initial value is read synchronously so the first
  // paint already excludes a previously-dismissed banner (no flash).
  let dismissed: boolean = $state(isDismissedFor(info.latestVersion));

  // If the manifest reports a new latest version, reset the dismiss
  // state for that version. The user is meant to see each release
  // at most once unless they explicitly click ×.
  $effect(() => {
    dismissed = isDismissedFor(info.latestVersion);
  });

  const isForce: boolean = $derived(info.isForceUpdate);
  const isVisible: boolean = $derived(info.isUpdateAvailable && !dismissed);

  function openInBrowser(url: string): void {
    if (typeof window === 'undefined') return;
    const cap = (
      window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }
    ).Capacitor?.Plugins?.['Browser'] as
      | { open?: (o: { url: string }) => Promise<void> }
      | undefined;
    if (cap?.open) {
      void cap.open({ url });
      return;
    }
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    if (!w) {
      window.location.href = url;
    }
  }

  function handleGetIt(): void {
    if (onGetIt) {
      onGetIt(info);
      return;
    }
    openInBrowser(info.downloadUrl);
  }

  function handleDismiss(): void {
    dismissFor(info.latestVersion);
    dismissed = true;
  }
</script>

{#if isVisible}
  <aside
    class="update-banner"
    class:update-banner--force={isForce}
    data-testid="update-banner"
    data-force={isForce ? 'true' : 'false'}
    data-dismissed={dismissed ? 'true' : 'false'}
    aria-live="polite"
    role="region"
    aria-label={isForce ? 'Required update' : 'Update available'}
  >
    <div class="update-banner__icon" data-testid="update-banner-icon" aria-hidden="true">
      <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" role="img">
        <rect x="3" y="3" width="18" height="18" rx="4" fill="currentColor" opacity="0.18" />
        <path d="M12 5 L17 12 L14 12 L14 18 L10 18 L10 12 L7 12 Z" fill="currentColor" />
      </svg>
    </div>

    <div class="update-banner__body">
      <p class="update-banner__title" data-testid="update-banner-title">
        {isForce ? 'Required update' : 'Update available'}
        <span class="update-banner__version" data-testid="update-banner-version">
          v{currentVersion} → v{info.latestVersion}
        </span>
      </p>
      {#if info.releaseNotes}
        <p class="update-banner__notes" data-testid="update-banner-notes">
          {info.releaseNotes}
        </p>
      {/if}
    </div>

    <div class="update-banner__actions">
      <button
        type="button"
        class="update-banner__btn update-banner__btn--primary"
        data-testid="update-banner-get-it"
        onclick={handleGetIt}
      >
        Get it
      </button>
      {#if !isForce}
        <button
          type="button"
          class="update-banner__btn update-banner__btn--dismiss"
          data-testid="update-banner-dismiss"
          onclick={handleDismiss}
          aria-label="Dismiss update notice"
        >
          <span aria-hidden="true">×</span>
        </button>
      {/if}
    </div>
  </aside>
{/if}

<style>
  .update-banner {
    display: flex;
    align-items: center;
    gap: var(--tn-sp-3);
    margin: var(--tn-sp-3) var(--tn-sp-3) 0;
    padding: var(--tn-sp-3) var(--tn-sp-4);
    background: var(--tn-bg-elevated, #24283b);
    border: 1px solid var(--tn-accent-blue, #7aa2f7);
    border-left-width: 4px;
    border-radius: var(--tn-radius-md, 12px);
    color: var(--tn-fg, #c0caf5);
    /* M3 emphasis: elevated surface + accent border. */
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.15);
  }

  .update-banner--force {
    border-color: var(--tn-accent-red, #f7768e);
    background: linear-gradient(
      180deg,
      rgba(247, 118, 142, 0.10),
      var(--tn-bg-elevated, #24283b) 60%
    );
  }

  .update-banner__icon {
    flex: 0 0 auto;
    color: var(--tn-accent-blue, #7aa2f7);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .update-banner--force .update-banner__icon {
    color: var(--tn-accent-red, #f7768e);
  }

  .update-banner__body {
    flex: 1 1 auto;
    min-width: 0;
  }

  .update-banner__title {
    margin: 0;
    font-size: 15px;
    line-height: 1.3;
    font-weight: 600;
    color: var(--tn-fg, #c0caf5);
  }

  .update-banner__version {
    margin-left: var(--tn-sp-2);
    font-family: var(--tn-font-mono, monospace);
    font-size: 13px;
    font-weight: 500;
    color: var(--tn-fg-dim, #9aa5ce);
  }

  .update-banner__notes {
    margin: var(--tn-sp-1) 0 0;
    font-size: 13px;
    line-height: 1.4;
    color: var(--tn-fg-dim, #9aa5ce);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .update-banner__actions {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: var(--tn-sp-2);
  }

  .update-banner__btn {
    border: 0;
    border-radius: var(--tn-radius-md, 12px);
    font-family: inherit;
    cursor: pointer;
    transition: opacity 150ms ease, transform 100ms ease;
  }

  .update-banner__btn:focus-visible {
    outline: 2px solid var(--tn-accent-blue, #7aa2f7);
    outline-offset: 2px;
  }

  .update-banner__btn:active {
    transform: scale(0.98);
  }

  .update-banner__btn--primary {
    /* 56dp touch target per R164 brief (M3 large). */
    min-height: 56px;
    min-width: 56px;
    padding: 0 var(--tn-sp-5);
    font-size: 15px;
    font-weight: 600;
    background: var(--tn-accent-blue, #7aa2f7);
    color: var(--tn-bg, #1a1b26);
  }

  .update-banner--force .update-banner__btn--primary {
    background: var(--tn-accent-red, #f7768e);
    color: var(--tn-bg, #1a1b26);
  }

  .update-banner__btn--primary:hover {
    opacity: 0.92;
  }

  .update-banner__btn--dismiss {
    /* 56dp touch target to match the primary CTA. */
    min-height: 56px;
    min-width: 56px;
    background: transparent;
    color: var(--tn-fg-dim, #9aa5ce);
    font-size: 22px;
    line-height: 1;
    border: 1px solid var(--tn-border, #414868);
  }

  .update-banner__btn--dismiss:hover {
    color: var(--tn-fg, #c0caf5);
    border-color: var(--tn-fg-muted, #565f89);
  }

  @media (prefers-reduced-motion: reduce) {
    .update-banner__btn {
      transition: none;
    }
  }
</style>
