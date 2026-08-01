/**
 * Anti-emoji tests for the onboarding module.
 *
 * Roman's hard rule: NO emoji in any UI surface (R82b caught 13+ violations
 * in the R80 site). These tests fail loudly if any emoji codepoint sneaks
 * into the onboarding source or rendered DOM.
 *
 * Coverage:
 *  1) Static scan of every .svelte / .ts file under
 *     src/components/onboarding — emoji must be absent from authored source.
 *  2) Rendered DOM scan of all 4 screens + the main OnboardingFlow — emoji
 *     must be absent from what users see.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import OnboardingFlow from '../OnboardingFlow.svelte';
import Welcome from '../screens/Welcome.svelte';
import Capture from '../screens/Capture.svelte';
import SmartEngine from '../screens/SmartEngine.svelte';
import LocalFirst from '../screens/LocalFirst.svelte';
import { onboardingStore } from '../onboardingStore';

const ONBOARDING_DIR = join(__dirname, '..');

/**
 * Matches the standard emoji and symbol ranges we want to forbid.
 *
 * Built from:
 *   - Misc Symbols / Pictographs / Emoticons / Transport
 *   - Supplemental Symbols and Pictographs
 *   - Symbols and Pictographs Extended-A
 *   - Regional Indicator Symbols
 *   - Combining Enclosing Keycap
 *   - Misc Symbols and Arrows
 *   - Variation Selectors
 *   - Zero-Width Joiner (when in a likely emoji sequence)
 *
 * Intentionally excludes the BMP arrow / geometric / math ranges that we
 * use in icon SVG path data (e.g. U+2190–U+21FF) — those are not emoji.
 */
const EMOJI_REGEX = /[\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F1FF}\u{1F200}-\u{1F2FF}\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}\u{200D}]/gu;

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__') continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (/\.(svelte|ts|css|html)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function findEmojiInText(text: string): { match: string; index: number }[] {
  const hits: { match: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  // Reset the regex state for each call.
  EMOJI_REGEX.lastIndex = 0;
  while ((m = EMOJI_REGEX.exec(text)) !== null) {
    hits.push({ match: m[0], index: m.index });
  }
  return hits;
}

function findEmojiInDom(container: HTMLElement): { match: string; where: string }[] {
  const text = container.textContent ?? '';
  const titleHits = findEmojiInText(text);
  return titleHits.map((h) => ({
    match: h.match,
    where: `textContent @ ${h.index}`,
  }));
}

describe('Onboarding — no emoji', () => {
  afterEach(cleanup);

  it('no emoji codepoints in any authored onboarding source file', () => {
    const files = collectSourceFiles(ONBOARDING_DIR);
    expect(files.length).toBeGreaterThan(0);
    const offenders: { file: string; match: string; index: number }[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const hits = findEmojiInText(text);
      for (const h of hits) {
        offenders.push({ file, match: h.match, index: h.index });
      }
    }
    if (offenders.length > 0) {
      const lines = offenders
        .map((o) => `  - ${o.file} @${o.index}: ${JSON.stringify(o.match)}`)
        .join('\n');
      throw new Error(`Emoji found in onboarding source:\n${lines}`);
    }
    expect(offenders.length).toBe(0);
  });

  it('no emoji codepoints in the rendered Welcome screen DOM', () => {
    const { container } = render(Welcome, { props: { onContinue: () => {} } });
    const hits = findEmojiInDom(container);
    expect(hits).toEqual([]);
  });

  it('no emoji codepoints in the rendered Capture screen DOM', () => {
    const { container } = render(Capture, { props: { onContinue: () => {}, onSkip: () => {} } });
    const hits = findEmojiInDom(container);
    expect(hits).toEqual([]);
  });

  it('no emoji codepoints in the rendered SmartEngine screen DOM', () => {
    const { container } = render(SmartEngine, { props: { onContinue: () => {}, onSkip: () => {} } });
    const hits = findEmojiInDom(container);
    expect(hits).toEqual([]);
  });

  it('no emoji codepoints in the rendered LocalFirst screen DOM', () => {
    const { container } = render(LocalFirst, { props: { onContinue: () => {} } });
    const hits = findEmojiInDom(container);
    expect(hits).toEqual([]);
  });

  it('no emoji codepoints across the full OnboardingFlow DOM after walking all screens', async () => {
    localStorage.clear();
    onboardingStore.reset();
    const { container } = render(OnboardingFlow, { props: { onComplete: () => {} } });
    // Walk all 4 screens so we test every panel, not just the first one.
    for (let i = 0; i < 4; i++) {
      const dots = screen.getAllByRole('button', { name: /Go to screen/ });
      await fireEvent.click(dots[i]);
    }
    const hits = findEmojiInDom(container);
    expect(hits).toEqual([]);
  });
});
