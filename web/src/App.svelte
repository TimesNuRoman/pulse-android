<script lang="ts">
  import { onMount } from 'svelte';
  import NotesView from './views/NotesView.svelte';
  import OnboardingFlow from './components/onboarding/OnboardingFlow.svelte';
  import UpdateCheckerMount from './lib/update-checker/UpdateCheckerMount.svelte';
  import {
    readPersistedCompleted,
    clearPersistedCompleted,
  } from './components/onboarding/onboardingStore';

  let onboarded = $state(false);
  let ready = $state(false);

  onMount(() => {
    onboarded = readPersistedCompleted();
    ready = true;
  });

  function handleComplete(): void {
    onboarded = true;
  }

  function handleReplayOnboarding(): void {
    // P1 #3 (R95 audit) — Settings → "Replay onboarding" returns the
    // user to the OnboardingFlow by clearing the completion flag and
    // flipping the local route flag. Same path a fresh install takes.
    clearPersistedCompleted();
    onboarded = false;
  }
</script>

<main class="app" data-testid="app-root" data-onboarded={onboarded ? 'true' : 'false'}>
  {#if !ready}
    <div class="app__splash" data-testid="app-splash" aria-hidden="true"></div>
  {:else if onboarded}
    <NotesView onReplayOnboarding={handleReplayOnboarding} />
  {:else}
    <OnboardingFlow onComplete={handleComplete} />
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
