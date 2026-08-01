<script lang="ts">
  import { onMount } from 'svelte';
  import { updateChecker, getInstalledVersion, type Manifest, type UpdateResult } from './update-checker';
  import UpdateDialog from './UpdateDialog.svelte';

  /**
   * UpdateCheckerMount — invisible parent that runs the update check
   * once on mount and conditionally surfaces <UpdateDialog />.
   *
   * Renders nothing when there's no update (or the check is still
   * in-flight on the first frame). Holds state internally — no props,
   * no events. The dialog fires `onUpdate` and `onLater` callbacks
   * that this component wires to the browser/Capacitor Browser and
   * to a `markSeen()` call.
   *
   * Cache is held in localStorage (24h TTL) so the dialog won't spam
   * the user on every app launch. The "Later" path doesn't fetch
   * again — the cache is already fresh, so the next check within
   * 24h will hit the cache and return needsUpdate: false (the cache
   * write happens on the same dialog mount).
   */
  let result = $state<UpdateResult | null>(null);
  let installed = $state<{ version: string; versionCode: number }>({ version: '0.0.0', versionCode: 0 });

  onMount(() => {
    installed = getInstalledVersion();
    void runCheck();
  });

  async function runCheck(): Promise<void> {
    try {
      result = await updateChecker.check();
    } catch {
      // Defensive: check() already swallows fetch errors, but if the
      // storage layer throws (private mode, quota) we just don't show.
      result = {
        needsUpdate: false,
        forceUpdate: false,
        manifest: null,
        fromCache: false,
        checkedAt: Date.now(),
        error: 'check failed',
      };
    }
  }

  function openInBrowser(url: string): void {
    if (typeof window === 'undefined') return;
    // Prefer @capacitor/browser on native for Chrome Custom Tab UX.
    // Falls back to window.open on web and to location.href as a last
    // resort (some WebViews block window.open in the same view).
    const cap = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } })
      .Capacitor?.Plugins?.['Browser'] as
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

  function handleUpdate(manifest: Manifest): void {
    openInBrowser(manifest.latest_apk_url);
    // Mark the cache as fresh so we don't re-prompt on the next
    // launch (the user is on their way to installing already).
    void updateChecker.markSeen();
  }

  function handleLater(_manifest: Manifest): void {
    // Cache is already fresh from the check that opened this dialog;
    // the 24h TTL covers the snooze. We could write a separate snooze
    // key, but the natural cache write handles "don't nag" without
    // extra state.
    void updateChecker.markSeen();
    result = null;
  }

  const showDialog = $derived(
    result !== null && result.needsUpdate && result.manifest !== null,
  );
</script>

{#if showDialog && result && result.manifest}
  <UpdateDialog
    manifest={result.manifest}
    installedVersion={installed.version}
    installedVersionCode={installed.versionCode}
    onUpdate={handleUpdate}
    onLater={result.forceUpdate ? undefined : handleLater}
  />
{/if}
