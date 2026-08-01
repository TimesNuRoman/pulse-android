#!/usr/bin/env node
/**
 * R81 — vitest runner wrapper (same junction workaround as build-web.mjs).
 *
 * Vitest 2.1 + Vite 5.4 fail to resolve the test setup file when the
 * project is reached through the C:\Users\1\.minimax-agent\projects
 * junction: Node canonicalises to H:\.sandbox\... and the H: prefix
 * gets parsed as a URL scheme, so `loadAndTransform` throws.
 *
 * Workaround: spawn vitest from the canonical H: location, where
 * all paths share one drive letter.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const H_ROOT = "H:\\.sandbox\\projects\\pulse-android";
const C_ROOT = "C:\\Users\\1\\.minimax-agent\\projects\\pulse-android";
const ROOT = existsSync(H_ROOT) ? H_ROOT : C_ROOT;
const WEB = resolve(ROOT, "web");

console.log(`[vitest] cwd = ${WEB}`);

const args = process.argv.slice(2);
// Default: run once with --run flag, no watch
if (!args.includes("--run") && !args.includes("--watch")) {
  args.push("--run");
}

const result = spawnSync("npx", ["vitest", ...args], {
  cwd: WEB,
  stdio: "inherit",
  shell: true,
});
process.exit(result.status ?? 1);
