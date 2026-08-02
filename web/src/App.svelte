<script lang="ts">
  import { onMount } from 'svelte';
  import NotesView from './views/NotesView.svelte';
  import OnboardingView from './views/OnboardingView.svelte';
  import UpdateCheckerMount from './lib/update-checker/UpdateCheckerMount.svelte';

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

  onMount(() => {
    onboarded = readOnboarded();
    ready = true;
  });

  function handleComplete(): void {
    onboarded = true;
  }

  function handleReplayOnboarding(): void {
    clearOnboarded();
    onboarded = false;
  }
</script>

<main class="app" data-testid="app-root" data-onboarded={onboarded ? 'true' : 'false'}>
  {#if !ready}
    <div class="app__splash" data-testid="app-splash" aria-hidden="true"></div>
  {:else if onboarded}
    <NotesView onReplayOnboarding={handleReplayOnboarding} />
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
