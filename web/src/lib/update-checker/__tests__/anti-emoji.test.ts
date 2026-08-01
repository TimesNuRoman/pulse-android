/**
 * Anti-emoji tests for the update-checker module.
 *
 * Roman's hard rule: NO emoji in any UI surface (R82b caught 13+ on
 * the site). The UpdateDialog and UpdateCheckerMount are surfaced to
 * the user, so they need the same guard as the onboarding screens.
 *
 * Coverage:
 *  1) Static scan of every .svelte / .ts file under
 *     src/lib/update-checker — emoji must be absent from authored source.
 *  2) Rendered DOM scan of UpdateDialog (both soft and force modes) — emoji
 *     must be absent from what users see.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render, cleanup } from '@testing-library/svelte';
import UpdateDialog from '../UpdateDialog.svelte';
import type { Manifest } from '../update-checker';

const UPDATE_CHECKER_DIR = join(__dirname, '..');

/**
 * Same emoji regex as the onboarding guard. See
 * src/components/onboarding/__tests__/anti-emoji.test.ts.
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
  EMOJI_REGEX.lastIndex = 0;
  while ((m = EMOJI_REGEX.exec(text)) !== null) {
    hits.push({ match: m[0], index: m.index });
  }
  return hits;
}

function findEmojiInDom(container: HTMLElement): { match: string; where: string }[] {
  const text = container.textContent ?? '';
  return findEmojiInText(text).map((h) => ({
    match: h.match,
    where: `textContent @ ${h.index}`,
  }));
}

const baseManifest: Manifest = {
  latest_version: '0.6.3',
  latest_version_code: 13,
  latest_apk_url: 'https://example.com/pulse-notes-0.6.3.apk',
  latest_apk_size_bytes: 4_500_000,
  latest_apk_sha256: '2F8BB21841763705C34FDA9DE1281A75029D524AB212F55E48C6BD7A9A288F60',
  release_notes_url: 'https://example.com/changelog#v0.6.3',
  min_supported_version: '0.3.0',
  force_update_below: '0.3.0',
};

describe('UpdateChecker — no emoji', () => {
  afterEach(cleanup);

  it('no emoji codepoints in any authored update-checker source file', () => {
    const files = collectSourceFiles(UPDATE_CHECKER_DIR);
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
      throw new Error(`Emoji found in update-checker source:\n${lines}`);
    }
    expect(offenders.length).toBe(0);
  });

  it('no emoji codepoints in the soft-update UpdateDialog rendered DOM', () => {
    const { container } = render(UpdateDialog, {
      props: {
        manifest: baseManifest,
        installedVersion: '0.6.2',
        installedVersionCode: 12,
        onUpdate: () => {},
        onLater: () => {},
      },
    });
    const hits = findEmojiInDom(container);
    expect(hits).toEqual([]);
  });

  it('no emoji codepoints in the force-update UpdateDialog rendered DOM', () => {
    const { container } = render(UpdateDialog, {
      props: {
        manifest: baseManifest,
        installedVersion: '0.2.9', // below force_update_below
        installedVersionCode: 9,
        onUpdate: () => {},
      },
    });
    const hits = findEmojiInDom(container);
    expect(hits).toEqual([]);
  });
});
