/*
 * Pulse — Typography tokens.
 * Compose Material 3 with two distinct families:
 *   - text   : system sans (UI labels, body, headings)
 *   - mono   : monospace (status bar, code, editor body, model name)
 *
 * Sizes follow the design spec:
 *   - Status bar mono 11px
 *   - Section head   11px uppercase, letter-spacing 0.08em
 *   - List item name 13px medium
 *   - List meta      11px dim
 *   - Title (editor) 22px bold
 *   - Body mono      14px
 *   - Body prose     14px, line-height 1.6
 *   - Search input   13px
 *   - Bottom nav     10px
 */
package com.pulse.android.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/** Monospace family — used for status bar, editor body, code, model name in chat top bar. */
val MonoFamily: FontFamily = FontFamily.Monospace

/** System sans — used for everything else. */
val SansFamily: FontFamily = FontFamily.SansSerif

internal val PulseTypography = Typography(
    // Display — used for the editor title (22px bold)
    displaySmall = TextStyle(
        fontFamily = SansFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 22.sp,
        lineHeight = 28.sp,
        letterSpacing = 0.sp,
    ),

    // Headline — onboarding titles (24px semibold)
    headlineSmall = TextStyle(
        fontFamily = SansFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 24.sp,
        lineHeight = 30.sp,
        letterSpacing = (-0.2).sp,
    ),
    headlineMedium = TextStyle(
        fontFamily = SansFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 26.sp,
        lineHeight = 32.sp,
    ),

    // Title — top bar / chat top bar / settings / search
    titleLarge = TextStyle(
        fontFamily = SansFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 15.sp,
        lineHeight = 20.sp,
    ),
    titleMedium = TextStyle(
        fontFamily = SansFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    ),
    titleSmall = TextStyle(
        fontFamily = SansFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 13.sp,
        lineHeight = 18.sp,
    ),

    // Body — list items, settings rows, editor body
    bodyLarge = TextStyle(
        fontFamily = SansFamily,
        fontSize = 15.sp,
        lineHeight = 22.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = SansFamily,
        fontSize = 13.sp,
        lineHeight = 20.sp,
    ),
    bodySmall = TextStyle(
        fontFamily = SansFamily,
        fontSize = 12.sp,
        lineHeight = 18.sp,
    ),

    // Label — buttons, chips, nav labels
    labelLarge = TextStyle(
        fontFamily = SansFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 14.sp,
        lineHeight = 18.sp,
    ),
    labelMedium = TextStyle(
        fontFamily = SansFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 16.sp,
    ),
    labelSmall = TextStyle(
        fontFamily = SansFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        lineHeight = 14.sp,
    ),
)

/** Section heads: 11px uppercase text-dim, 0.08em letter-spacing. */
internal val SectionHeadStyle = TextStyle(
    fontFamily = SansFamily,
    fontSize = 11.sp,
    fontWeight = FontWeight.Medium,
    letterSpacing = (0.08 * 16).sp,  // 0.08em
    lineHeight = 14.sp,
)

/** Editor body: 14px monospace with 1.5x line height. */
internal val EditorBodyMono = TextStyle(
    fontFamily = MonoFamily,
    fontSize = 14.sp,
    lineHeight = 22.sp,  // ~1.57x
)

/** Editor body: 14px sans with 1.6x line height (rendered mode). */
internal val EditorBodyProse = TextStyle(
    fontFamily = SansFamily,
    fontSize = 14.sp,
    lineHeight = 22.sp,  // 1.57x
)

/** Status bar style: 11px monospace. */
internal val StatusBarStyle = TextStyle(
    fontFamily = MonoFamily,
    fontSize = 11.sp,
    lineHeight = 14.sp,
)

/** Chat top-bar model name: 12px monospace. */
internal val ChatModelStyle = TextStyle(
    fontFamily = MonoFamily,
    fontSize = 12.sp,
    lineHeight = 16.sp,
)
