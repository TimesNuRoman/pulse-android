<script lang="ts">
  import { onMount } from 'svelte';
  import NotesView from './views/NotesView.svelte';
  import OnboardingView from './views/OnboardingView.svelte';
  import UpdateCheckerMount from './lib/update-checker/UpdateCheckerMount.svelte';
  import { notesStore } from './lib/notesStore';
  import { parseDeeplink } from './lib/deeplink';

  // R118 — onboarding is a 3-slide pager (Local-first, Voice+AI,
  // Markdown+[[wikilinks]]) keyed to `pulse.onboarded`. The previous
  // 4-screen OnboardingFlow (R85+) is still on disk under
  // components/onboarding/ for reference but no longer wired in. When
  // the user hits "Replay onboarding" in Settings, we clear the flag
  // and flip the local route flag so the same path a fresh install
  // takes runs.
  const ONBOARDED_KEY = 'pulse.onboarded';

  function readOnboarded(): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
      return localStorage.getItem(ONBOARDED_KEY) === 'true';
    } catch {
      return false;
    }
  }

  function clearOnboarded(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(ONBOARDED_KEY);
    } catch {
      // ignore
    }
  }

  let onboarded = $state(false);
  let ready = $state(false);
  // R173 — deep link target set by handleDeepLink (Android App plugin).
  // NotesView picks this up via a prop and opens the matching note.
  let pendingNoteId = $state<string | null>(null);

  onMount(() => {
    onboarded = readOnboarded();
    ready = true;

    // R173 — flush pending widget cache on app close. The store debounces
    // writes (800ms) so most edits are persisted already; this is just
    // the safety net for "typed something then immediately closed".
    const onBeforeUnload = (): void => {
      notesStore.flushWidgetCache();
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    // R173 — deep link handler. The Android widget fires
    // pulse://note/{id} via the App plugin's appUrlOpen event, which we
    // also wire through Capacitor's window.handleOpenUrl fallback.
    // (Full event wiring lives in NotesView; we just stash the id here.)
    const tryParse = (raw: string | null | undefined): void => {
      const link = parseDeeplink(raw);
      if (link?.type === 'note') {
        pendingNoteId = link.id;
      }
    };
    const onAppUrlOpen = (event: Event): void => {
      const detail = (event as CustomEvent<{ url?: string }>).detail;
      tryParse(detail?.url);
    };
    const onHandleOpenUrl = (event: Event): void => {
      const detail = (event as CustomEvent<string>).detail;
      tryParse(detail);
    };
    window.addEventListener('appUrlOpen', onAppUrlOpen as EventListener);
    window.addEventListener('handleOpenUrl', onHandleOpenUrl as EventListener);

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('appUrlOpen', onAppUrlOpen as EventListener);
      window.removeEventListener('handleOpenUrl', onHandleOpenUrl as EventListener);
    };
  });

  function handleComplete(): void {
    onboarded = true;
  }

  function handleReplayOnboarding(): void {
    clearOnboarded();
    onboarded = false;
  }

  function handleNoteOpened(): void {
    pendingNoteId = null;
  }
</script>

<main class="app" data-testid="app-root" data-onboarded={onboarded ? 'true' : 'false'}>
  {#if !ready}
    <div class="app__splash" data-testid="app-splash" aria-hidden="true"></div>
  {:else if onboarded}
    <NotesView
      onReplayOnboarding={handleReplayOnboarding}
      pendingNoteId={pendingNoteId}
      onNoteOpened={handleNoteOpened}
    />
  {:else}
    <OnboardingView onComplete={handleComplete} />
  {/if}
  {#if ready}
    <UpdateCheckerMount />
  {/if}
</main>

<style>
  .app {
    display: block;
    width: 100%;
    min-height: 100vh;
    min-height: 100dvh;
    background: var(--tn-bg);
  }

  .app__splash {
    width: 100%;
    height: 100vh;
    height: 100dvh;
    background: var(--tn-bg);
  }
</style>
