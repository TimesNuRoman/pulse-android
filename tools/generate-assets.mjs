// Pulse Android assets generator (cycle 25).
// - Splash: 2732x2732 PNG (Capacitor drawable/splash.png) + 1920x1920 port-xxxhdpi
// - App icon: 5 mipmap sizes (square + round) for pre-Android 8
// - Adaptive icon foreground: VectorDrawable XML (sharp at any density)
//
// Input:  H:\Вайбкодинг\projects\pulse\web\public\pulse.svg
// Output: android/app/src/main/res/...
//         resources/splash.png (preview master)

import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SVG_SRC = 'H:\\Вайбкодинг\\projects\\pulse\\web\\public\\pulse.svg';
const RES = join(ROOT, 'android', 'app', 'src', 'main', 'res');
const PREVIEW = join(ROOT, 'resources', 'splash.png');

// Brand palette (must match pulse.svg)
const BG = '#0a0a0a';
const ACCENT = '#0ff';        // cyan EKG
const FG = '#ffffff';
const MUTED = '#888888';

const SPLASH_SIZE = 2732;     // Capacitor @1x for xxxhdpi
const SPLASH_PORT_XXXHDPI = 1920;
const ICON_MASTER = 1024;     // master canvas for icon rasterization

// ────────────────────────────────────────────────────────────────
// SVG helpers — wrap pulse.svg inside composed layouts
// ────────────────────────────────────────────────────────────────

function splashSvg() {
  // Pulse logo: r=14 in 32x32. Scale to 480 in 1024 (centered at 512,512).
  // EKG line: original path goes through y=10..22; stroke-width=2. Recompose larger.
  // "Pulse" H1 144px @ 1024 viewport, subhead 56px.
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SPLASH_SIZE} ${SPLASH_SIZE}" width="${SPLASH_SIZE}" height="${SPLASH_SIZE}">
  <rect width="${SPLASH_SIZE}" height="${SPLASH_SIZE}" fill="${BG}"/>
  <g transform="translate(${SPLASH_SIZE/2 - 240}, ${SPLASH_SIZE/2 - 320})">
    <circle cx="240" cy="240" r="220" fill="#111111" stroke="${ACCENT}" stroke-width="4"/>
    <path d="M70 240 L160 240 L210 130 L270 350 L320 240 L410 240"
          stroke="${ACCENT}" stroke-width="20" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <text x="${SPLASH_SIZE/2}" y="${SPLASH_SIZE/2 + 360}" text-anchor="middle"
        font-family="-apple-system, 'Segoe UI', Roboto, sans-serif" font-size="172" font-weight="500" fill="${FG}">Pulse</text>
  <text x="${SPLASH_SIZE/2}" y="${SPLASH_SIZE/2 + 470}" text-anchor="middle"
        font-family="-apple-system, 'Segoe UI', Roboto, sans-serif" font-size="64" font-weight="400" fill="${MUTED}" letter-spacing="2">Local. Private. 12MB.</text>
</svg>`;
}

function iconSvg({ circle = true, safeZone = false } = {}) {
  // Master 1024×1024.
  // If circle=true: clip to circle (for ic_launcher.png on devices that don't auto-mask).
  // If safeZone=true: shrink content into 66% center (adaptive icon foreground spec).
  const cx = ICON_MASTER / 2;
  const cy = ICON_MASTER / 2;
  const scale = safeZone ? 0.66 : 1.0;
  const r = 360 * scale;   // outer circle radius
  const sw = 12 * scale;   // stroke width
  // EKG path scaled around center.
  const ekg = `M${cx - 220*scale} ${cy} L${cx - 110*scale} ${cy} L${cx - 60*scale} ${cy - 130*scale} L${cx + 20*scale} ${cy + 150*scale} L${cx + 80*scale} ${cy} L${cx + 220*scale} ${cy}`;
  const swEkg = 28 * scale;

  let body = '';
  if (circle) {
    body += `<circle cx="${cx}" cy="${cy}" r="${cx}" fill="${BG}"/>`;
  } else {
    body += `<rect width="${ICON_MASTER}" height="${ICON_MASTER}" fill="${BG}"/>`;
  }
  body += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#111111" stroke="${ACCENT}" stroke-width="${sw}"/>`;
  body += `<path d="${ekg}" stroke="${ACCENT}" stroke-width="${swEkg}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ICON_MASTER} ${ICON_MASTER}" width="${ICON_MASTER}" height="${ICON_MASTER}">
${body}
</svg>`;
}

// ────────────────────────────────────────────────────────────────
// Render
// ────────────────────────────────────────────────────────────────

async function renderSvgToPng(svg, outPath, size) {
  const buf = Buffer.from(svg, 'utf8');
  await sharp(buf, { density: 384 })
    .resize(size, size, { fit: 'cover' })
    .png({ compressionLevel: 9, quality: 90 })
    .toFile(outPath);
  const { size: bytes } = await import('node:fs').then(m => m.promises.stat(outPath));
  console.log(`  → ${outPath.replace(ROOT + '\\', '')}  (${(bytes/1024).toFixed(1)} KB, ${size}px)`);
  return bytes;
}

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

async function main() {
  // Sanity: source SVG must exist
  await readFile(SVG_SRC);

  console.log('▸ Splash (2732×2732 + 1920×1920)');
  await ensureDir(dirname(PREVIEW));
  await renderSvgToPng(splashSvg(), PREVIEW, SPLASH_SIZE);
  await renderSvgToPng(splashSvg(), join(RES, 'drawable', 'splash.png'), SPLASH_SIZE);
  await ensureDir(join(RES, 'drawable-port-xxxhdpi'));
  await renderSvgToPng(splashSvg(), join(RES, 'drawable-port-xxxhdpi', 'splash.png'), SPLASH_PORT_XXXHDPI);

  console.log('▸ App icons — mipmap PNG fallbacks (pre-Android 8)');
  const sizes = [
    { d: 'mipmap-mdpi',    px: 48  },
    { d: 'mipmap-hdpi',    px: 72  },
    { d: 'mipmap-xhdpi',   px: 96  },
    { d: 'mipmap-xxhdpi',  px: 144 },
    { d: 'mipmap-xxxhdpi', px: 192 },
  ];
  for (const { d, px } of sizes) {
    await ensureDir(join(RES, d));
    await renderSvgToPng(iconSvg({ circle: false }), join(RES, d, 'ic_launcher.png'), px);
    await renderSvgToPng(iconSvg({ circle: true  }), join(RES, d, 'ic_launcher_round.png'), px);
  }

  console.log('▸ Adaptive icon foreground — VectorDrawable (Android 8+)');
  // viewBox 108x108 (Android standard), pulse content inside 66% safe zone (≈72×72).
  // We keep the same composition as the PNG master, normalized to 108.
  const v = (n) => n.toFixed(3);
  const cx = 54, cy = 54, scale = 0.66;
  const r = 36 * scale;        // ≈23.76
  const sw = 1.2 * scale;      // ≈0.79
  const ekg = `M${v(cx - 22*scale)} ${v(cy)} L${v(cx - 11*scale)} ${v(cy)} L${v(cx - 6*scale)} ${v(cy - 13*scale)} L${v(cx + 2*scale)} ${v(cy + 15*scale)} L${v(cx + 8*scale)} ${v(cy)} L${v(cx + 22*scale)} ${v(cy)}`;
  const swEkg = 2.8 * scale;   // ≈1.85

  const vectorXml = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="#111111"
        android:pathData="M${v(cx)},${v(cy - r)} a${v(r)},${v(r)} 0 1,0 0.001,0 Z" />
    <path
        android:strokeColor="${ACCENT}"
        android:strokeWidth="${v(sw)}"
        android:fillColor="#00000000"
        android:pathData="M${v(cx)},${v(cy - r)} a${v(r)},${v(r)} 0 1,0 0.001,0 Z" />
    <path
        android:strokeColor="${ACCENT}"
        android:strokeWidth="${v(swEkg)}"
        android:strokeLineCap="round"
        android:strokeLineJoin="round"
        android:fillColor="#00000000"
        android:pathData="${ekg}" />
</vector>
`;
  const fgPath = join(RES, 'drawable', 'ic_launcher_foreground.xml');
  await writeFile(fgPath, vectorXml, 'utf8');
  console.log(`  → ${fgPath.replace(ROOT + '\\', '')}  (vector)`);

  console.log('\n✓ Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
