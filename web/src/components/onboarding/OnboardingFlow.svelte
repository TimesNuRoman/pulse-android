<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { onboardingStore, type ScreenIndex, SCREEN_COUNT, readPersistedCompleted } from './onboardingStore';
  import ProgressDots from './ProgressDots.svelte';
  import Welcome from './screens/Welcome.svelte';
  import Capture from './screens/Capture.svelte';
  import SmartEngine from './screens/SmartEngine.svelte';
  import LocalFirst from './screens/LocalFirst.svelte';
  import { hapticImpact } from '$lib/capacitor';

  interface Props {
    onComplete: () => void;
  }

  let { onComplete }: Props = $props();

  let current = $state<ScreenIndex>(0);
  let mounted = $state(false);
  let completedOnMount = $state(false);
  let slideDirection = $state<'forward' | 'back'>('forward');

  onMount(() => {
    if (readPersistedCompleted()) {
      // Already onboarded — caller should have routed us off this flow,
      // but defensively fire the callback so we never strand the user.
      completedOnMount = true;
      onComplete();
      return;
    }
    const initial = get(onboardingStore);
    current = initial.currentScreen;
    mounted = true;

    const unsub = onboardingStore.subscribe((s) => {
      const wasCurrent = current;
      if (s.currentScreen !== wasCurrent) {
        slideDirection = s.currentScreen > wasCurrent ? 'forward' : 'back';
        void hapticImpact({ light: true });
      }
      current = s.currentScreen;
    });

    return unsub;
  });

  const isLast = $derived(current === SCREEN_COUNT - 1);

  function handleWelcome(): void {
    onboardingStore.next();
  }
  function handleCapture(): void {
    onboardingStore.next();
  }
  function handleSe3(): void {
    onboardingStore.next();
  }
  function handleLocalFirst(): void {
    onboardingStore.complete();
    onComplete();
  }
  function handleSkip(): void {
    // Skip on screens 2/3 jumps to the last screen (so user sees the legal
    // footer and final CTA before the flow exits).
    onboardingStore.skip();
  }
  function handleDotClick(idx: ScreenIndex): void {
    onboardingStore.goTo(idx);
  }
</script>

<div class="onboarding" data-testid="onboarding-flow" data-mounted={mounted ? 'true' : 'false'}>
  <div
    class="onboarding__track"
    data-testid="onboarding-track"
    data-direction={slideDirection}
    data-current={current}
    style="--onboarding-offset: {current * 100}%;"
  >
    <div class="onboarding__panel" data-testid="onboarding-panel-0">
      <Welcome onContinue={handleWelcome} />
    </div>
    <div class="onboarding__panel" data-testid="onboarding-panel-1">
      <Capture onContinue={handleCapture} onSkip={handleSkip} />
    </div>
    <div class="onboarding__panel" data-testid="onboarding-panel-2">
      <SmartEngine onContinue={handleSe3} onSkip={handleSkip} />
    </div>
    <div class="onboarding__panel" data-testid="onboarding-panel-3">
      <LocalFirst onContinue={handleLocalFirst} />
    </div>
  </div>

  <div class="onboarding__footer">
    <ProgressDots current={current} onDotClick={handleDotClick} />
  </div>
</div>

<style>
  .onboarding {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100vh;
    height: 100dvh;
    background: var(--tn-bg);
    overflow: hidden;
  }

  .onboarding__track {
    display: flex;
    flex: 1 1 auto;
    width: 400%; /* SCREEN_COUNT * 100% */
    transform: translateX(calc(-1 * var(--onboarding-offset, 0%)));
    transition: transform 220ms cubic-bezier(0.4, 0, 0.2, 1);
    will-change: transform;
  }

  .onboarding__panel {
    flex: 0 0 25%; /* 1 / SCREEN_COUNT */
    height: 100%;
    overflow: hidden;
  }

  .onboarding__footer {
    flex: 0 0 auto;
    background: var(--tn-bg);
    border-top: 1px solid var(--tn-border);
    padding: var(--tn-sp-2) 0 env(safe-area-inset-bottom, 0);
  }

  @media (prefers-reduced-motion: reduce) {
    .onboarding__track {
      transition: none;
    }
  }
</style>
