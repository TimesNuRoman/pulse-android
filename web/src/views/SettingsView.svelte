<!--
  SettingsView — profile, theme, feedback, backup/restore, and about.
  R152 adds the Backup & restore section (2 buttons, import modal,
  replace confirmation, last-export info, progress + toast).
  SPDX-License-Identifier: Apache-2.0
-->
<script lang="ts">
  import { userSettings, setDisplayName } from '$lib/settingStore';
  import { notesStore } from '$lib/notesStore';
  import { APP_VERSION, updateChecker } from '$lib/update-checker/update-checker';
  import { hapticImpact } from '$lib/capacitor';
  import { hapticsEnabled, setHapticsEnabled, tap } from '$lib/haptics';
  import {
    exportAllNotes,
    parseBackupFile,
    mergeNotes,
    replaceNotes,
    previewMerge,
    type BackupFile,
  } from '$lib/backupRestore';
  import { saveBackupFile, pickBackupFile, readFileAsText } from '$lib/backupFileSystem';
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

  // Backup & restore state (R152)
  const LAST_EXPORT_KEY = 'pulse.backup.lastExport';
  let lastExportAt: number | null = $state(null);
  let backupBusy: 'export' | 'import' | null = $state(null);
  let backupProgress: { current: number; total: number } | null = $state(null);
  let backupError: string | null = $state(null);
  // Import flow has 3 stages: file (just picked, strategy not chosen),
  // strategy (showing merge/replace picker), replace-confirm (asking the
  // user to confirm the destructive replace).
  let importStage: 'file' | 'strategy' | 'replace-confirm' | null = $state(null);
  let importFileName: string = $state('');
  let importStrategy: 'merge' | 'replace' = $state('merge');
  let importParsed: BackupFile | null = $state(null);
  let importDiff = $state<{ added: number; updated: number; unchanged: number } | null>(null);
  let toast: { msg: string; kind: 'ok' | 'err' } | null = $state(null);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let importDialogEl: HTMLDivElement | undefined = $state();
  let confirmDialogEl: HTMLDivElement | undefined = $state();

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
    const raw = localStorage.getItem(LAST_EXPORT_KEY);
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n > 0) lastExportAt = n;
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

  function flashToast(msg: string, kind: 'ok' | 'err' = 'ok'): void {
    toast = { msg, kind };
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast = null;
    }, 3000);
  }

  // --- Backup & restore handlers --------------------------------------------

  async function handleExport(): Promise<void> {
    if (backupBusy) return;
    void hapticImpact({ light: true });
    backupBusy = 'export';
    backupError = null;
    backupProgress = { current: 0, total: notesStore.list().length };
    try {
      // Stream a tiny progress signal so the spinner feels live on big
      // sets. Most exports are < 100 notes, so this is one tick.
      const notes = notesStore.list();
      backupProgress = { current: Math.floor(notes.length / 2), total: notes.length };
      const { json, filename } = exportAllNotes(notes, APP_VERSION);
      backupProgress = { current: notes.length, total: notes.length };
      const res = await saveBackupFile(json, filename);
      // Persist last-export time and surface a success toast.
      const now = Date.now();
      lastExportAt = now;
      try {
        localStorage.setItem(LAST_EXPORT_KEY, String(now));
      } catch {
        // quota / private mode — ignore
      }
      const saved = notes.length;
      const where = res.path ? ` to ${res.path}` : '';
      flashToast(`Exported ${saved} note${saved === 1 ? '' : 's'}${where}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      backupError = msg;
      flashToast('Export failed', 'err');
    } finally {
      backupBusy = null;
      backupProgress = null;
    }
  }

  async function handleImportStart(): Promise<void> {
    if (backupBusy) return;
    void hapticImpact({ light: true });
    backupError = null;
    try {
      const file = await pickBackupFile();
      if (!file) return; // user cancelled
      importFileName = file.name;
      importStage = 'file';
      // Parse + validate. Show errors immediately rather than waiting
      // for the strategy modal.
      const text = await readFileAsText(file);
      try {
        importParsed = parseBackupFile(text);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        importParsed = null;
        backupError = msg;
        flashToast('Invalid backup file', 'err');
        resetImport();
        return;
      }
      const existing = notesStore.list();
      importDiff = previewMerge(existing, importParsed.notes);
      importStrategy = 'merge';
      importStage = 'strategy';
      queueMicrotask(() => importDialogEl?.focus());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      backupError = msg;
      flashToast('Import failed', 'err');
      resetImport();
    }
  }

  function handleImportStrategyChange(e: Event): void {
    const value = (e.target as HTMLInputElement).value;
    importStrategy = value === 'replace' ? 'replace' : 'merge';
    if (importStrategy === 'replace') {
      importStage = 'replace-confirm';
      queueMicrotask(() => confirmDialogEl?.focus());
    }
  }

  function handleImportConfirm(): void {
    if (!importParsed) return;
    if (importStrategy === 'replace' && importStage !== 'replace-confirm') {
      importStage = 'replace-confirm';
      queueMicrotask(() => confirmDialogEl?.focus());
      return;
    }
    void runImport();
  }

  async function runImport(): Promise<void> {
    if (!importParsed) return;
    void hapticImpact({ medium: true });
    backupBusy = 'import';
    backupError = null;
    const total = importParsed.notes.length;
    backupProgress = { current: 0, total };
    try {
      // Pure merge / replace: keep existing-by-id with higher updatedAt,
      // add imported-only, drop existing-only on replace.
      const existing = notesStore.list();
      const next =
        importStrategy === 'replace'
          ? replaceNotes(existing, importParsed.notes)
          : mergeNotes(existing, importParsed.notes);
      backupProgress = { current: Math.floor(total / 2), total };
      // Yield once so the spinner can paint before the bulk write.
      await new Promise((r) => setTimeout(r, 0));
      // Atomic swap through notesStore.replaceAll — preserves ids and
      // createdAt / updatedAt from the imported payload so a future
      // re-import round-trips cleanly.
      notesStore.replaceAll(next);
      backupProgress = { current: total, total };
      const saved = importParsed.notes.length;
      const verb = importStrategy === 'replace' ? 'Replaced with' : 'Imported';
      flashToast(`${verb} ${saved} note${saved === 1 ? '' : 's'}`);
      resetImport();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      backupError = msg;
      flashToast('Import failed', 'err');
    } finally {
      backupBusy = null;
      backupProgress = null;
    }
  }

  function handleImportCancel(): void {
    void hapticImpact({ light: true });
    resetImport();
  }

  function resetImport(): void {
    importStage = null;
    importFileName = '';
    importParsed = null;
    importDiff = null;
  }

  function handleModalKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    if (importStage === 'strategy') {
      e.preventDefault();
      handleImportCancel();
    } else if (importStage === 'replace-confirm') {
      e.preventDefault();
      importStage = 'strategy';
      queueMicrotask(() => importDialogEl?.focus());
    }
  }

  function handleBackdropClick(e: MouseEvent, close: () => void): void {
    if (e.target === e.currentTarget) {
      close();
    }
  }

  const checkedAtLabel = $derived(
    lastCheckedAt ? new Date(lastCheckedAt).toLocaleString() : 'never',
  );
  const lastExportLabel = $derived(
    lastExportAt ? new Date(lastExportAt).toLocaleString() : 'never',
  );
  const progressLabel = $derived.by(() => {
    const bp = backupProgress;
    return bp !== null ? `${bp.current} of ${bp.total}` : '';
  });
</script>

<svelte:window onkeydown={handleModalKeydown} />

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

  <section class="settings-view__section" data-testid="settings-section-backup" aria-labelledby="settings-backup-h">
    <h2 class="settings-view__section-title" id="settings-backup-h">Backup &amp; restore</h2>
    <p class="settings-view__hint" data-testid="settings-backup-note">
      Export all notes to a JSON file. Import with merge (keeps newer edits) or replace.
    </p>
    <div class="settings-view__backup-grid" data-testid="settings-backup-grid">
      <button
        type="button"
        class="btn btn--primary settings-view__backup-btn"
        onclick={handleExport}
        disabled={backupBusy !== null}
        data-testid="settings-backup-export"
        aria-label="Export all notes to JSON file"
      >
        {backupBusy === 'export' ? `Exporting... ${progressLabel}` : 'Export all notes'}
      </button>
      <button
        type="button"
        class="btn btn--ghost settings-view__backup-btn"
        onclick={handleImportStart}
        disabled={backupBusy !== null}
        data-testid="settings-backup-import"
        aria-label="Import notes from JSON file"
      >
        {backupBusy === 'import' ? `Importing... ${progressLabel}` : 'Import notes'}
      </button>
    </div>
    <p class="settings-view__hint settings-view__backup-last" data-testid="settings-backup-last-export">
      Last export: <span data-testid="settings-backup-last-export-value">{lastExportLabel}</span>
    </p>
    {#if backupError}
      <p class="settings-view__error" role="alert" data-testid="settings-backup-error">{backupError}</p>
    {/if}
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

{#if importStage === 'strategy'}
  <div
    class="settings-view__backdrop"
    onclick={(e) => handleBackdropClick(e, handleImportCancel)}
    data-testid="import-modal-backdrop"
  >
    <div
      bind:this={importDialogEl}
      class="settings-view__modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
      tabindex="-1"
      data-testid="import-modal"
    >
      <header class="settings-view__modal-header">
        <h2 id="import-modal-title" class="settings-view__modal-title">Import notes</h2>
        <button
          type="button"
          class="settings-view__modal-close"
          onclick={handleImportCancel}
          aria-label="Close import dialog"
          data-testid="import-modal-close"
        >
          Close
        </button>
      </header>
      <div class="settings-view__modal-body">
        <p class="settings-view__modal-meta" data-testid="import-modal-filename">
          File: <span class="settings-view__mono">{importFileName}</span>
        </p>
        {#if importParsed}
          <p class="settings-view__modal-meta" data-testid="import-modal-summary">
            {importParsed.notes.length} note{importParsed.notes.length === 1 ? '' : 's'} from
            <span class="settings-view__mono">{importParsed.appVersion}</span>
            ({new Date(importParsed.exportedAt).toLocaleString()})
          </p>
        {/if}
        {#if importDiff}
          <p class="settings-view__modal-meta" data-testid="import-modal-diff">
            {importDiff.added} new, {importDiff.updated} updated, {importDiff.unchanged} unchanged
          </p>
        {/if}
        <fieldset class="settings-view__fieldset" data-testid="import-modal-strategy">
          <legend class="settings-view__legend">Strategy</legend>
          <label class="settings-view__radio">
            <input
              type="radio"
              name="import-strategy"
              value="merge"
              checked={importStrategy === 'merge'}
              onchange={handleImportStrategyChange}
              data-testid="import-strategy-merge"
            />
            <span>
              <strong>Merge with existing</strong>
              <span class="settings-view__radio-hint">
                Imported notes are added; notes with the same id keep the newer updatedAt.
              </span>
            </span>
          </label>
          <label class="settings-view__radio">
            <input
              type="radio"
              name="import-strategy"
              value="replace"
              checked={importStrategy === 'replace'}
              onchange={handleImportStrategyChange}
              data-testid="import-strategy-replace"
            />
            <span>
              <strong>Replace all</strong>
              <span class="settings-view__radio-hint">
                Discard every existing note. Only the imported set remains.
              </span>
            </span>
          </label>
        </fieldset>
      </div>
      <footer class="settings-view__modal-footer">
        <button
          type="button"
          class="btn btn--ghost"
          onclick={handleImportCancel}
          data-testid="import-modal-cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          class="btn btn--primary"
          onclick={handleImportConfirm}
          data-testid="import-modal-confirm"
        >
          Import
        </button>
      </footer>
    </div>
  </div>
{/if}

{#if importStage === 'replace-confirm'}
  <div
    class="settings-view__backdrop"
    onclick={(e) => handleBackdropClick(e, () => (importStage = 'strategy'))}
    data-testid="import-confirm-backdrop"
  >
    <div
      bind:this={confirmDialogEl}
      class="settings-view__modal"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="import-confirm-title"
      aria-describedby="import-confirm-desc"
      tabindex="-1"
      data-testid="import-confirm-modal"
    >
      <header class="settings-view__modal-header">
        <h2 id="import-confirm-title" class="settings-view__modal-title">Replace all notes?</h2>
      </header>
      <div class="settings-view__modal-body">
        <p id="import-confirm-desc" data-testid="import-confirm-desc">
          Every existing note will be discarded. The imported set will be the only notes left.
        </p>
      </div>
      <footer class="settings-view__modal-footer">
        <button
          type="button"
          class="btn btn--ghost"
          onclick={() => (importStage = 'strategy')}
          data-testid="import-confirm-back"
        >
          Back
        </button>
        <button
          type="button"
          class="btn btn--danger"
          onclick={runImport}
          data-testid="import-confirm-replace"
        >
          Replace all
        </button>
      </footer>
    </div>
  </div>
{/if}

{#if toast}
  <div
    class="settings-view__toast"
    class:settings-view__toast--ok={toast.kind === 'ok'}
    class:settings-view__toast--err={toast.kind === 'err'}
    role="status"
    aria-live="polite"
    data-testid="settings-backup-toast"
  >
    {toast.msg}
  </div>
{/if}

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
  .settings-view__backup-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 12px;
  }
  @media (max-width: 480px) {
    .settings-view__backup-grid {
      grid-template-columns: 1fr;
    }
  }
  .settings-view__backup-btn {
    min-height: 60px;
    font-size: 15px;
  }
  .settings-view__backup-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .settings-view__backup-last {
    margin: 4px 0 0;
    font-size: 12px;
  }
  .settings-view__error {
    margin: 8px 0 0;
    color: var(--tn-red, #f7768e);
    font-size: 13px;
  }
  .settings-view__backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 16px;
  }
  .settings-view__modal {
    width: 100%;
    max-width: 480px;
    background: var(--tn-bg-elevated, #24283b);
    border: 1px solid var(--tn-border, #414868);
    border-radius: var(--tn-radius-md, 12px);
    display: flex;
    flex-direction: column;
    max-height: 90vh;
  }
  .settings-view__modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--tn-border, #414868);
  }
  .settings-view__modal-title {
    margin: 0;
    font-size: 16px;
  }
  .settings-view__modal-close {
    background: none;
    border: 1px solid var(--tn-border, #414868);
    color: var(--tn-fg, #c0caf5);
    padding: 4px 10px;
    border-radius: var(--tn-radius-sm, 6px);
    cursor: pointer;
    min-height: 36px;
  }
  .settings-view__modal-body {
    padding: 16px;
    overflow-y: auto;
  }
  .settings-view__modal-meta {
    margin: 0 0 8px;
    font-size: 13px;
    color: var(--tn-fg-dim, #9aa5ce);
  }
  .settings-view__fieldset {
    border: 1px solid var(--tn-border, #414868);
    border-radius: var(--tn-radius-sm, 6px);
    padding: 8px 12px;
    margin: 12px 0 0;
  }
  .settings-view__legend {
    padding: 0 6px;
    font-size: 12px;
    color: var(--tn-fg-muted, #565f89);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .settings-view__radio {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 8px 0;
    cursor: pointer;
  }
  .settings-view__radio input {
    margin-top: 4px;
  }
  .settings-view__radio-hint {
    display: block;
    font-size: 12px;
    color: var(--tn-fg-muted, #565f89);
    margin-top: 2px;
  }
  .settings-view__modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--tn-border, #414868);
  }
  .settings-view__toast {
    position: fixed;
    right: 16px;
    bottom: 16px;
    width: 240px;
    padding: 12px 14px;
    border-radius: var(--tn-radius-sm, 6px);
    font-size: 13px;
    background: var(--tn-bg-elevated, #24283b);
    border: 1px solid var(--tn-border, #414868);
    color: var(--tn-fg, #c0caf5);
    z-index: 200;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }
  .settings-view__toast--ok {
    border-color: var(--tn-green, #9ece6a);
  }
  .settings-view__toast--err {
    border-color: var(--tn-red, #f7768e);
  }
</style>
