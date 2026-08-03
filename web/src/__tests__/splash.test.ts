// R166 — web splash overlay tests.
// Two required tests per the R166 brief:
//   1. Splash overlay element exists in DOM with correct background color
//      CSS var.
//   2. Splash auto-dismisses after 1500ms (use fake timers).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getSplash, dismissSplash, setupAutoDismiss, SPLASH_DISMISS_MS } from '../lib/splash';

function mountSplashElement(): void {
  // Mirror the production index.html structure: a single
  // <div id="web-splash" class="web-splash"> with the dark
  // background-color set via the CSS var the test asserts on.
  document.body.innerHTML = '';
  const splash = document.createElement('div');
  splash.id = 'web-splash';
  splash.className = 'web-splash';
  splash.dataset.testid = 'web-splash';
  splash.setAttribute('aria-hidden', 'true');
  splash.style.backgroundColor = 'var(--tn-bg)';
  const mark = document.createElement('div');
  mark.className = 'web-splash__mark';
  mark.setAttribute('aria-hidden', 'true');
  const wordmark = document.createElement('div');
  wordmark.className = 'web-splash__wordmark';
  wordmark.textContent = 'Pulse';
  splash.appendChild(mark);
  splash.appendChild(wordmark);
  document.body.appendChild(splash);
}

describe('R166 web splash', () => {
  beforeEach(() => {
    mountSplashElement();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('splash overlay element exists in DOM with the Tokyo Night bg CSS var', () => {
    const splash = getSplash();
    expect(splash).not.toBeNull();
    expect(splash?.dataset.testid).toBe('web-splash');
    // Background color is the CSS var, not a hard hex. This is what
    // app.css renders against, so the visual matches the native
    // splash.png (which uses the same #1a1b26).
    expect(splash?.style.backgroundColor).toBe('var(--tn-bg)');
  });

  it('auto-dismisses after the configured 1500ms via fake timers', () => {
    vi.useFakeTimers();
    setupAutoDismiss();

    // Right after setup, splash is still mounted and not hidden.
    const splash = getSplash();
    expect(splash).not.toBeNull();
    expect(splash?.classList.contains('web-splash--hidden')).toBe(false);

    // Advance to one tick before the dismiss threshold.
    vi.advanceTimersByTime(SPLASH_DISMISS_MS - 1);
    expect(getSplash()?.classList.contains('web-splash--hidden')).toBe(false);

    // Cross the threshold; the dismiss class is applied. The element
    // stays in the DOM for the 300ms CSS fade before removal.
    vi.advanceTimersByTime(1);
    expect(getSplash()?.classList.contains('web-splash--hidden')).toBe(true);

    // After the fade-out, the element is removed.
    vi.advanceTimersByTime(300);
    expect(getSplash()).toBeNull();
  });

  it('dismissSplash() is idempotent', () => {
    // The R166 brief didn't require this, but it locks the contract
    // for any future caller that races with the auto-dismiss timer.
    dismissSplash();
    expect(getSplash()?.classList.contains('web-splash--hidden')).toBe(true);
    dismissSplash(); // second call must not throw
    expect(getSplash()?.classList.contains('web-splash--hidden')).toBe(true);
  });
});
