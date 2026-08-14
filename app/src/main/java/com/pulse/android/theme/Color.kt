/*
 * Pulse — Tokyo Night color tokens.
 * Mirrors the design preview at android-tmp/index.html (locked palette, do not drift).
 * These tokens are consumed by every Compose surface; XML themes only use them for
 * the system-level splash + status/nav bar tints.
 *
 * Rule: `border-radius: 0` global. Don't add rounded shapes here.
 *        `color` only — no Material elevation overlays, no gradients.
 */
package com.pulse.android.theme

import androidx.compose.ui.graphics.Color

// ----- Backgrounds -----
val PulseBg = Color(0xFF1A1B26)
val PulseBg2 = Color(0xFF16171F)
val PulseSurface = Color(0xFF1F2335)
val PulseSurface2 = Color(0xFF24283B)

// ----- Borders -----
val PulseBorder = Color(0x14FFFFFF)        // rgba(255,255,255,0.08)
val PulseBorderStrong = Color(0x24FFFFFF)  // rgba(255,255,255,0.14)

// ----- Text -----
val PulseText = Color(0xFFC0CAF5)
val PulseTextMuted = Color(0xFF9AA5CE)
val PulseTextDim = Color(0xFF565F89)

// ----- Accents -----
val PulsePrimary = Color(0xFFBB9AF7)       // Tokyo Night purple — used for active states, links, brand
val PulsePrimary2 = Color(0xFF9D7CD8)
val PulseOnPrimary = Color(0xFF1A1525)
val PulseAccent = Color(0xFF7AA2F7)        // Blue — used for FAB icon highlight, link icon

// ----- Status -----
val PulseGreen = Color(0xFF9ECE6A)
val PulseRed = Color(0xFFF7768E)
val PulseYellow = Color(0xFFE0AF68)

// ----- Composer / input bg -----
val PulseInputBg = PulseSurface
val PulseInputBgActive = PulseSurface2
