#!/usr/bin/env node
/**
 * R81 — build-web wrapper.
 *
 * Vite 5.4 has a bug where the HTML plugin emits the absolute junction
 * path (e.g. H:/.sandbox/.../web/index.html) as the fileName, which
 * Rollup rejects with "must be strings that are neither absolute nor
 * relative paths". The C:\Users\1\.minimax-agent\projects tree is a
 * junction to H:\.sandbox\projects, so Node canonicalises all paths to
 * H:\ — and the HTML plugin does not normalise back to a basename.
 *
 * Workaround: run the actual `vite build` from the canonical H:\
 * location, where all paths share one drive letter. The build output
 * ends up in the same dist/ directory either way (Capacitor then copies
 * it into android/app/src/main/assets/public on `cap sync`).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const H_ROOT = "H:\\.sandbox\\projects\\pulse-android";
const C_ROOT = "C:\\Users\\1\\.minimax-agent\\projects\\pulse-android";

// Pick the canonical root — prefer H: if it exists, fall back to C:
const ROOT = existsSync(H_ROOT) ? H_ROOT : C_ROOT;
const WEB = resolve(ROOT, "web");

console.log(`[build-web] ROOT = ${ROOT}`);
console.log(`[build-web] WEB  = ${WEB}`);

// Step 1: ensure web deps are installed (idempotent; cheap if already there)
const install = spawnSync("npm", ["install", "--no-audit", "--no-fund"], {
  cwd: WEB,
  stdio: "inherit",
  shell: true,
});
if (install.status !== 0) {
  console.error("[build-web] npm install failed");
  process.exit(install.status ?? 1);
}

// Step 2: vite build
const build = spawnSync("npm", ["run", "build"], {
  cwd: WEB,
  stdio: "inherit",
  shell: true,
});
if (build.status !== 0) {
  console.error("[build-web] vite build failed");
  process.exit(build.status ?? 1);
}

console.log("[build-web] done");
