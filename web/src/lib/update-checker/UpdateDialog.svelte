<script lang="ts">
  import type { Manifest } from './update-checker';

  /**
   * UpdateDialog — M3 expressive modal for an available app update.
   *
   * Surfaces when the UpdateChecker finds a newer manifest. The dialog
   * is "soft" by default (Update now / Later) and "block" when the
   * installed version is below `force_update_below` (Update now only,
   * back-button disabled).
   *
   * Anti-emoji policy: never insert an emoji codepoint in any text
   * content. Decorative SVG icons are fine (geometric paths, not
   * pictographs). See `__tests__/anti-emoji.test.ts`.
   *
   * 44dp touch minimum, 48dp preferred. Width capped at 360px (M3
   * basic dialog max-width). The dialog is rendered into a portal-
   * style position (fixed, full-screen scrim); the parent decides
   * when to mount/unmount.
   */
  interface Props {
    manifest: Manifest;
    installedVersion: string;
    installedVersionCode: number;
    onUpdate: (manifest: Manifest) => void;
    onLater?: (manifest: Manifest) => void;
  }

  let {
    manifest,
    installedVersion,
    installedVersionCode,
    onUpdate,
    onLater,
  }: Props = $props();

  const isForce = $derived(
    manifest.force_update_below.length > 0 &&
      isBelow(installedVersion, manifest.force_update_below),
  );

  const isStale = $derived(
    isBelow(installedVersion, manifest.min_supported_version) &&
      !isForce,
  );

  const sizeMb = $derived((manifest.latest_apk_size_bytes / (1024 * 1024)).toFixed(2));

  const title = $derived(isForce ? 'Update required' : 'Update available');
  const subtitle = $derived(
    isForce
      ? 'Your version is no longer supported. Please update to continue.'
      : isStale
        ? 'A new version is available. Your version is getting old.'
        : 'A new version of Pulse Notes is available.',
  );

  const ctaLabel = $derived(isForce ? 'Update now' : 'Get the update');

  function isBelow(a: string, b: string): boolean {
    const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
    const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const ai = pa[i] ?? 0;
      const bi = pb[i] ?? 0;
      if (ai < bi) return true;
      if (ai > bi) return false;
    }
    return false;
  }

  function handleUpdate(): void {
    onUpdate(manifest);
  }

  function handleLater(): void {
    onLater?.(manifest);
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (isForce && (e.key === 'Escape' || e.key === 'Backspace')) {
      e.preventDefault();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="ud-scrim"
  data-testid="update-dialog-scrim"
  data-force={isForce ? 'true' : 'false'}
  role="presentation"
>
  <div
    class="ud-dialog"
    data-testid="update-dialog"
    data-force={isForce ? 'true' : 'false'}
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="ud-title"
    aria-describedby="ud-subtitle ud-body"
  >
    <div class="ud-icon" data-testid="ud-icon" aria-hidden="true">
      <svg
        width="48"
        height="48"
        viewBox="0 0 48 48"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Update arrow"
      >
        <!-- Up-arrow inside a rounded square (no emoji, geometric path) -->
        <rect x="4" y="4" width="40" height="40" rx="10" fill="var(--tn-accent-blue)" opacity="0.18" />
        <path
          d="M24 14 L34 26 L28 26 L28 34 L20 34 L20 26 L14 26 Z"
          fill="var(--tn-accent-blue)"
        />
      </svg>
    </div>

    <h2 id="ud-title" class="ud-title" data-testid="ud-title">{title}</h2>
    <p id="ud-subtitle" class="ud-subtitle" data-testid="ud-subtitle">{subtitle}</p>

    <dl class="ud-meta" data-testid="ud-meta">
      <div class="ud-meta__row">
        <dt class="ud-meta__label">Installed</dt>
        <dd class="ud-meta__value" data-testid="ud-installed">
          v{installedVersion} <span class="ud-meta__muted">(code {installedVersionCode})</span>
        </dd>
      </div>
      <div class="ud-meta__row">
        <dt class="ud-meta__label">Latest</dt>
        <dd class="ud-meta__value ud-meta__value--accent" data-testid="ud-latest">
          v{manifest.latest_version}
          <span class="ud-meta__muted">(code {manifest.latest_version_code})</span>
        </dd>
      </div>
      <div class="ud-meta__row">
        <dt class="ud-meta__label">Size</dt>
        <dd class="ud-meta__value" data-testid="ud-size">{sizeMb} MB</dd>
      </div>
    </dl>

    <p id="ud-body" class="ud-body" data-testid="ud-body">
      <a
        class="ud-link"
        href={manifest.release_notes_url}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="ud-release-notes-link"
      >
        Read the release notes
      </a>
      before you update, or jump straight in.
    </p>

    {#if manifest.latest_apk_sha256}
      <p class="ud-sha" data-testid="ud-sha">
        SHA-256:
        <code class="ud-sha__code" data-testid="ud-sha-code"
          >{manifest.latest_apk_sha256.slice(0, 16)}…{manifest.latest_apk_sha256.slice(-8)}</code
        >
      </p>
    {/if}

    <div class="ud-actions" data-testid="ud-actions">
      <button
        type="button"
        class="ud-btn ud-btn--primary"
        data-testid="ud-cta-update"
        onclick={handleUpdate}
      >
        {ctaLabel}
      </button>
      {#if !isForce && onLater}
        <button
          type="button"
          class="ud-btn ud-btn--text"
          data-testid="ud-cta-later"
          onclick={handleLater}
        >
          Later
        </button>
      {/if}
    </div>

    <p class="ud-footer" data-testid="ud-footer">
      Pulse Notes v{manifest.latest_version} &middot; Apache 2.0
    </p>
  </div>
</div>

<style>
  .ud-scrim {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(0, 0, 0, 0.65);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--tn-sp-4);
    /* M3 dialog scrim has a 50ms fade-in. */
    animation: ud-fade 120ms ease-out;
  }

  .ud-dialog {
    width: 100%;
    max-width: 360px;
    background: var(--tn-bg-elevated);
    color: var(--tn-fg);
    border: 1px solid var(--tn-border);
    border-radius: var(--tn-radius-lg);
    padding: var(--tn-sp-5) var(--tn-sp-5) var(--tn-sp-4);
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.45);
    display: flex;
    flex-direction: column;
    gap: var(--tn-sp-3);
    /* M3 dialog entrance: 220ms scale + fade. */
    animation: ud-pop 220ms cubic-bezier(0.2, 0, 0, 1);
  }

  .ud-icon {
    align-self: flex-start;
    margin-bottom: var(--tn-sp-1);
  }

  .ud-title {
    margin: 0;
    font-size: 22px;
    line-height: 1.25;
    font-weight: 600;
    color: var(--tn-fg);
    letter-spacing: -0.01em;
  }

  .ud-subtitle {
    margin: 0;
    font-size: 15px;
    line-height: 1.45;
    color: var(--tn-fg-dim);
  }

  .ud-meta {
    margin: var(--tn-sp-2) 0 0;
    padding: var(--tn-sp-3) var(--tn-sp-4);
    background: var(--tn-bg-overlay);
    border: 1px solid var(--tn-border);
    border-radius: var(--tn-radius-md);
    display: flex;
    flex-direction: column;
    gap: var(--tn-sp-2);
  }

  .ud-meta__row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--tn-sp-3);
    margin: 0;
  }

  .ud-meta__label {
    font-size: 13px;
    color: var(--tn-fg-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
  }

  .ud-meta__value {
    margin: 0;
    font-size: 14px;
    font-family: var(--tn-font-mono);
    color: var(--tn-fg);
  }

  .ud-meta__value--accent {
    color: var(--tn-accent-blue);
  }

  .ud-meta__muted {
    color: var(--tn-fg-muted);
    font-size: 12px;
  }

  .ud-body {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
    color: var(--tn-fg-dim);
  }

  .ud-link {
    color: var(--tn-accent-blue);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .ud-sha {
    margin: 0;
    font-size: 12px;
    color: var(--tn-fg-muted);
    font-family: var(--tn-font-mono);
  }

  .ud-sha__code {
    color: var(--tn-fg-dim);
    background: var(--tn-bg);
    border: 1px solid var(--tn-border);
    border-radius: var(--tn-radius-sm);
    padding: 1px 6px;
  }

  .ud-actions {
    display: flex;
    flex-direction: column-reverse;
    gap: var(--tn-sp-2);
    margin-top: var(--tn-sp-2);
  }

  .ud-btn {
    min-height: var(--tn-touch-pref);
    padding: 0 var(--tn-sp-5);
    border-radius: var(--tn-radius-md);
    font-size: 15px;
    font-weight: 600;
    border: 0;
    cursor: pointer;
    transition: opacity 150ms ease, transform 100ms ease;
  }

  .ud-btn:active {
    transform: scale(0.98);
  }

  .ud-btn:focus-visible {
    outline: 2px solid var(--tn-accent-blue);
    outline-offset: 2px;
  }

  .ud-btn--primary {
    background: var(--tn-accent-blue);
    color: var(--tn-bg);
  }

  .ud-btn--primary:hover {
    opacity: 0.92;
  }

  .ud-btn--text {
    background: transparent;
    color: var(--tn-fg-dim);
    border: 1px solid var(--tn-border);
  }

  .ud-btn--text:hover {
    color: var(--tn-fg);
    border-color: var(--tn-fg-muted);
  }

  .ud-footer {
    margin: var(--tn-sp-1) 0 0;
    font-size: 11px;
    color: var(--tn-fg-muted);
    font-family: var(--tn-font-mono);
    text-align: center;
  }

  @keyframes ud-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes ud-pop {
    from { opacity: 0; transform: scale(0.96); }
    to { opacity: 1; transform: scale(1); }
  }

  @media (prefers-reduced-motion: reduce) {
    .ud-scrim,
    .ud-dialog {
      animation: none;
    }
  }
</style>
