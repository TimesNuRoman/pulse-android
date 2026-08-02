<script lang="ts">
  import { userSettings, setDisplayName } from '$lib/settingStore';
  import { notesStore } from '$lib/notesStore';
  import { APP_VERSION, updateChecker } from '$lib/update-checker/update-checker';
  import { hapticImpact } from '$lib/capacitor';
  import { hapticsEnabled, setHapticsEnabled, tap } from '$lib/haptics';
  import { onMount } from 'svelte';

  interface Props {
    onBack: () => void;
    onReplayOnboarding: () => void;
  }
  let { onBack, onReplayOnboarding }: Props = $props();

  // Cache-snapshot of the manifest that update-checker last saw. Read
  // once on mount — Settings is informational, not live. Host and SHA
  // both come from this single source so the About section stays
  // consistent with what the update dialog would show.
  // See src/lib/update-checker/update-checker.ts:511 (readCache) and
  // :658 (writeCache) for the underlying localStorage shape.
  let manifestHost: string = $state('—');
  let manifestSha: string = $state('—');
  let lastCheckedAt: number | null = $state(null);

  onMount(() => {
    const cached = updateChecker.readCache();
    if (cached && cached.manifest) {
      try {
        const u = new URL(cached.manifest.latest_apk_url);
        manifestHost = u.host;
      } catch {
        manifestHost = '—';
      }
      manifestSha = cached.manifest.latest_apk_sha256;
      lastCheckedAt = cached.checkedAt;
    }
  });

  function onNameInput(e: Event): void {
    const value = (e.target as HTMLInputElement).value;
    setDisplayName(value);
  }

  function tapBack(): void {
    void hapticImpact({ light: true });
    onBack();
  }

  function tapReplay(): void {
    void hapticImpact({ light: true });
    onReplayOnboarding();
  }

  function tapResetMocks(): void {
    void hapticImpact({ light: true });
    notesStore.resetToMocks();
  }

  function onHapticsToggle(e: Event): void {
    const checked = (e.target as HTMLInputElement).checked;
    setHapticsEnabled(checked);
    // Fire one `light` tap on enable so the user feels confirmation
    // (no-op on disable by design — R118 spec).
    if (checked) void tap('light');
  }

  const checkedAtLabel = $derived(
    lastCheckedAt ? new Date(lastCheckedAt).toLocaleString() : 'never',
  );
</script>

<main class="settings-view" data-testid="settings-view">
  <header class="settings-view__header">
    <button
      type="button"
      class="btn btn--ghost"
      onclick={tapBack}
      data-testid="settings-back"
      aria-label="Back to notes"
    >
      Back
    </button>
    <h1 class="settings-view__title">Settings</h1>
  </header>

  <section class="settings-view__section" data-testid="settings-section-profile" aria-labelledby="settings-profile-h">
    <h2 class="settings-view__section-title" id="settings-profile-h">Profile</h2>
    <label class="settings-view__field">
      <span class="settings-view__label">Display name (optional)</span>
      <input
        class="settings-view__input"
        type="text"
        maxlength="32"
        placeholder="Display name (optional)"
        value={$userSettings.displayName}
        oninput={onNameInput}
        data-testid="settings-display-name"
        aria-label="Display name"
      />
    </label>
  </section>

  <section class="settings-view__section" data-testid="settings-section-theme" aria-labelledby="settings-theme-h">
    <h2 class="settings-view__section-title" id="settings-theme-h">Theme</h2>
    <p class="settings-view__hint" data-testid="settings-theme-note">Dark only. Tokyo Night palette.</p>
    <div class="settings-view__swatches" aria-label="Tokyo Night palette swatches" data-testid="settings-swatches">
      <span class="swatch" style="background:#1a1b26" title="#1a1b26 bg"></span>
      <span class="swatch" style="background:#c0caf5" title="#c0caf5 fg"></span>
      <span class="swatch" style="background:#7aa2f7" title="#7aa2f7 accent blue"></span>
      <span class="swatch" style="background:#9ece6a" title="#9ece6a accent green"></span>
    </div>
  </section>

  <section class="settings-view__section" data-testid="settings-section-feedback" aria-labelledby="settings-feedback-h">
    <h2 class="settings-view__section-title" id="settings-feedback-h">Feedback</h2>
    <label class="settings-view__toggle">
      <span class="settings-view__label">Haptics</span>
      <input
        type="checkbox"
        class="settings-view__toggle-input"
        checked={$hapticsEnabled}
        onchange={onHapticsToggle}
        data-testid="settings-haptics-toggle"
        aria-label="Haptics"
      />
    </label>
    <p class="settings-view__hint" data-testid="settings-haptics-note">
      Tactile taps for saves, deletes, tab switches, and mic start/stop.
    </p>
  </section>

  <section class="settings-view__section" data-testid="settings-section-about" aria-labelledby="settings-about-h">
    <h2 class="settings-view__section-title" id="settings-about-h">About</h2>
    <dl class="settings-view__meta">
      <div class="settings-view__meta-row">
        <dt>Version</dt>
        <dd data-testid="settings-version">{APP_VERSION}</dd>
      </div>
      <div class="settings-view__meta-row">
        <dt>Manifest host</dt>
        <dd data-testid="settings-manifest-host">{manifestHost}</dd>
      </div>
      <div class="settings-view__meta-row">
        <dt>SHA-256</dt>
        <dd class="settings-view__mono" data-testid="settings-manifest-sha">{manifestSha}</dd>
      </div>
      <div class="settings-view__meta-row">
        <dt>Last check</dt>
        <dd data-testid="settings-last-check">{checkedAtLabel}</dd>
      </div>
      <div class="settings-view__meta-row">
        <dt>License</dt>
        <dd>
          <a
            href="https://www.apache.org/licenses/LICENSE-2.0"
            rel="license"
            target="_blank"
            data-testid="settings-license-link"
          >
            Apache 2.0
          </a>
        </dd>
      </div>
    </dl>
  </section>

  <section class="settings-view__section" data-testid="settings-section-actions" aria-labelledby="settings-actions-h">
    <h2 class="settings-view__section-title" id="settings-actions-h">Actions</h2>
    <button
      type="button"
      class="btn btn--ghost settings-view__action"
      onclick={tapReplay}
      data-testid="settings-replay-onboarding"
    >
      Replay onboarding
    </button>
    <button
      type="button"
      class="btn btn--danger settings-view__action"
      onclick={tapResetMocks}
      data-testid="settings-reset-mocks"
    >
      Reset to mock data
    </button>
  </section>
</main>

<style>
  .settings-view {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    min-height: 100dvh;
    background: var(--tn-bg, #1a1b26);
    color: var(--tn-fg, #c0caf5);
    padding-bottom: env(safe-area-inset-bottom);
  }
  .settings-view__header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    border-bottom: 1px solid var(--tn-border, #414868);
    background: var(--tn-bg-elevated, #24283b);
  }
  .settings-view__title {
    margin: 0;
    font-size: 20px;
    flex: 1;
  }
  .settings-view__section {
    margin: 12px 16px;
    padding: 16px;
    background: var(--tn-bg-elevated, #24283b);
    border: 1px solid var(--tn-border, #414868);
    border-radius: var(--tn-radius-md, 12px);
  }
  .settings-view__section-title {
    margin: 0 0 12px;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--tn-fg-dim, #9aa5ce);
  }
  .settings-view__field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .settings-view__label {
    font-size: 12px;
    color: var(--tn-fg-muted, #565f89);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .settings-view__input {
    min-height: var(--tn-touch-min, 44px);
    padding: 8px 12px;
    font-size: 16px;
    background: var(--tn-bg, #1a1b26);
    border: 1px solid var(--tn-border, #414868);
    border-radius: var(--tn-radius-sm, 6px);
    color: var(--tn-fg, #c0caf5);
  }
  .settings-view__hint {
    margin: 0 0 12px;
    font-size: 14px;
    color: var(--tn-fg-dim, #9aa5ce);
  }
  .settings-view__swatches {
    display: flex;
    gap: 8px;
  }
  .settings-view__toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: var(--tn-touch-min, 44px);
    cursor: pointer;
  }
  .settings-view__toggle-input {
    width: 44px;
    height: 24px;
    cursor: pointer;
  }
  .swatch {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    border: 1px solid var(--tn-border, #414868);
  }
  .settings-view__meta {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .settings-view__meta-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    font-size: 14px;
  }
  .settings-view__meta-row dt {
    color: var(--tn-fg-muted, #565f89);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .settings-view__meta-row dd {
    margin: 0;
    text-align: right;
    word-break: break-all;
  }
  .settings-view__mono {
    font-family: var(--tn-font-mono, monospace);
    font-size: 12px;
    color: var(--tn-fg-dim, #9aa5ce);
  }
  .settings-view__action {
    width: 100%;
    margin-top: 8px;
  }
</style>
