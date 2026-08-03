// R166 — Pulse Android asset renderer.
//
// SPDX-License-Identifier: Apache-2.0
//
// Reads the master mark (drawable/ic_pulse_logo.xml) + the gradient
// background (drawable/ic_launcher_background.xml) and rasterises
// them to PNGs for every density Capacitor expects.
//
//   - mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher.png         (square)
//   - mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher_round.png   (square, same bitmap)
//   - drawable/splash.png                                  (2732x2732, square)
//   - drawable-port-{m,h,xh,xxh,xxxh}dpi/splash.png        (portrait Capacitor)
//
// No external dependencies beyond `sharp` (already in the root
// package.json devDependencies). PNGs are written with the highest
// compression level + quality 90; sub-1KB icons are expected.

import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const RES = join(ROOT, 'android', 'app', 'src', 'main', 'res');

// Brand palette (must match ic_pulse_logo.xml + ic_launcher_background.xml).
const BG_TOP = '#1a1b26';
const BG_BOTTOM = '#16161e';
const P_BLUE = '#7aa2f7';
const P_PURPLE = '#bb9af7';
const FG = '#c0caf5';

// Master canvas sizes.
const ICON_MASTER = 1024;       // Internal render canvas for the icon.
const SPLASH_SIZE = 2732;       // Capacitor @1x for splash.png (square).
const SPLASH_PORT_XXXHDPI = 1920;
const SPLASH_PORT_XXHDPI = 1280;
const SPLASH_PORT_XHDPI = 960;
const SPLASH_PORT_HDPI = 640;
const SPLASH_PORT_MDPI = 480;

// Mipmap densities (mdpi = 48, hdpi = 72, ...). Square PNGs only.
const ICON_SIZES = [
  { d: 'mipmap-mdpi',    px: 48  },
  { d: 'mipmap-hdpi',    px: 72  },
  { d: 'mipmap-xhdpi',   px: 96  },
  { d: 'mipmap-xxhdpi',  px: 144 },
  { d: 'mipmap-xxxhdpi', px: 192 },
];

// ─────────────────────────────────────────────────────────────────
// SVG composition
// ─────────────────────────────────────────────────────────────────

// Pulse mark, copied from drawable/ic_pulse_logo.xml.
// Kept in sync manually — if you change the master mark XML, mirror
// the change here. The viewport is 108x108; we render the mark inside
// the inner ~66% safe zone in iconSvg() and centered in splashSvg().
const MARK_PATHS = {
  p: 'M 30,28 L 30,80 L 40,80 L 40,64 L 58,64 C 68,64 74,57 74,48 C 74,39 68,28 58,28 L 30,28 Z M 40,38 L 58,38 C 62,38 65,42 65,48 C 65,52 62,56 58,56 L 40,56 L 40,38 Z',
  spark: 'M 84,24 L 86,32 L 94,34 L 86,36 L 84,44 L 82,36 L 74,34 L 82,32 Z',
};

function escapeXml(s) {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

function iconSvg() {
  // ICON_MASTER x ICON_MASTER canvas. Background = vertical gradient
  // (matches drawable/ic_launcher_background.xml). Mark = P+spark
  // centered in the 66% safe zone (matches the adaptive-icon spec).
  const cx = ICON_MASTER / 2;
  const cy = ICON_MASTER / 2;
  const scale = ICON_MASTER / 108;
  // P spans roughly x=30..74, y=28..80 (44x52). Centered at (cx, cy)
  // means we shift the mark so its geometric center sits at (cx, cy).
  // The mark's bounding box center is (52, 54) in 108-viewport.
  const markOffsetX = cx - 52 * scale;
  const markOffsetY = cy - 54 * scale;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ICON_MASTER} ${ICON_MASTER}" width="${ICON_MASTER}" height="${ICON_MASTER}">
  <defs>
    <linearGradient id="bg" x1="${cx}" y1="0" x2="${cx}" y2="${ICON_MASTER}" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${BG_TOP}"/>
      <stop offset="100%" stop-color="${BG_BOTTOM}"/>
    </linearGradient>
  </defs>
  <rect width="${ICON_MASTER}" height="${ICON_MASTER}" fill="url(#bg)"/>
  <g transform="translate(${markOffsetX} ${markOffsetY}) scale(${scale})">
    <path fill="${P_BLUE}" fill-rule="evenodd" d="${MARK_PATHS.p}"/>
    <path fill="${P_PURPLE}" d="${MARK_PATHS.spark}"/>
  </g>
</svg>`;
}

function splashSvg(includeWordmark) {
  // SPLASH_SIZE x SPLASH_SIZE canvas. Mark centered; wordmark (if
  // enabled) sits below the mark. Capacitor's CENTER_CROP will crop
  // the edges on small phones, so the mark is in the inner 60% area
  // (the "always visible" safe area).
  const cx = SPLASH_SIZE / 2;
  // Mark canvas: 108-viewport at 1080x1080 (the mark is 108x108 in
  // its native units, so 1080/108 = 10px per unit, fits a 1080 mark
  // inside 2732 with plenty of bleed for CENTER_CROP).
  const MARK_PX = 1080;
  const markOffsetX = cx - MARK_PX / 2;
  const markOffsetY = SPLASH_SIZE / 2 - MARK_PX / 2 - (includeWordmark ? 240 : 0);
  const markScale = MARK_PX / 108;
  let wordmark = '';
  if (includeWordmark) {
    // Pulse wordmark: 220px @ 2732, centered below mark.
    // y = mark bottom + 360 = (markOffsetY + MARK_PX) + 360
    const textY = markOffsetY + MARK_PX + 380;
    wordmark = `<text x="${cx}" y="${textY}" text-anchor="middle" font-family="sans-serif" font-size="220" font-weight="500" fill="${FG}">${escapeXml('Pulse')}</text>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SPLASH_SIZE} ${SPLASH_SIZE}" width="${SPLASH_SIZE}" height="${SPLASH_SIZE}">
  <defs>
    <linearGradient id="bg" x1="${cx}" y1="0" x2="${cx}" y2="${SPLASH_SIZE}" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${BG_TOP}"/>
      <stop offset="100%" stop-color="${BG_BOTTOM}"/>
    </linearGradient>
  </defs>
  <rect width="${SPLASH_SIZE}" height="${SPLASH_SIZE}" fill="url(#bg)"/>
  <g transform="translate(${markOffsetX} ${markOffsetY}) scale(${markScale})">
    <path fill="${P_BLUE}" fill-rule="evenodd" d="${MARK_PATHS.p}"/>
    <path fill="${P_PURPLE}" d="${MARK_PATHS.spark}"/>
  </g>
  ${wordmark}
</svg>`;
}

// ─────────────────────────────────────────────────────────────────
// Render pipeline
// ─────────────────────────────────────────────────────────────────

async function renderSvgToPng(svg, outPath, size) {
  const buf = Buffer.from(svg, 'utf8');
  await sharp(buf, { density: 384 })
    .resize(size, size, { fit: 'cover' })
    .png({ compressionLevel: 9, quality: 90 })
    .toFile(outPath);
  const { size: bytes } = await import('node:fs').then((m) => m.promises.stat(outPath));
  const rel = outPath.replace(ROOT + '\\', '');
  console.log(`  -> ${rel}  (${(bytes / 1024).toFixed(1)} KB, ${size}px)`);
  return bytes;
}

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

async function main() {
  // Sanity: master mark XML must exist.
  await readFile(join(RES, 'drawable', 'ic_pulse_logo.xml'));

  console.log('▸ Splash (2732x2732)');
  await renderSvgToPng(splashSvg(true), join(RES, 'drawable', 'splash.png'), SPLASH_SIZE);

  console.log('▸ Splash portrait variants (Capacitor drawable-port-*)');
  const portSizes = [
    { d: 'drawable-port-mdpi',    px: SPLASH_PORT_MDPI    },
    { d: 'drawable-port-hdpi',    px: SPLASH_PORT_HDPI    },
    { d: 'drawable-port-xhdpi',   px: SPLASH_PORT_XHDPI   },
    { d: 'drawable-port-xxhdpi',  px: SPLASH_PORT_XXHDPI  },
    { d: 'drawable-port-xxxhdpi', px: SPLASH_PORT_XXXHDPI },
  ];
  for (const { d, px } of portSizes) {
    await ensureDir(join(RES, d));
    await renderSvgToPng(splashSvg(true), join(RES, d, 'splash.png'), px);
  }

  console.log('▸ App icons — mipmap PNGs (pre-Android 8 fallback)');
  for (const { d, px } of ICON_SIZES) {
    await ensureDir(join(RES, d));
    // Square + round use the same bitmap. Some launchers mask; some
    // request the round variant directly.
    await renderSvgToPng(iconSvg(), join(RES, d, 'ic_launcher.png'), px);
    await renderSvgToPng(iconSvg(), join(RES, d, 'ic_launcher_round.png'), px);
  }

  console.log('\n✓ Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
