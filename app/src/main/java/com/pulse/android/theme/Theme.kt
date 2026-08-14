/*
 * Pulse — Theme.
 * Dark only by design. Light theme deliberately omitted from v1.
 * Compose-only — XML themes handle splash + system bars before attach.
 */
package com.pulse.android.theme

import android.app.Activity
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val PulseColorScheme: ColorScheme = darkColorScheme(
    primary           = PulsePrimary,
    onPrimary         = PulseOnPrimary,
    primaryContainer  = PulsePrimary2,
    onPrimaryContainer = PulseOnPrimary,
    inversePrimary    = PulseAccent,

    secondary         = PulseAccent,
    onSecondary       = PulseOnPrimary,
    secondaryContainer = PulseSurface2,
    onSecondaryContainer = PulseText,

    tertiary          = PulseGreen,
    onTertiary        = PulseBg,
    tertiaryContainer = PulseSurface2,
    onTertiaryContainer = PulseText,

    background        = PulseBg,
    onBackground      = PulseText,

    surface           = PulseSurface,
    onSurface         = PulseText,
    surfaceVariant    = PulseSurface2,
    onSurfaceVariant  = PulseTextMuted,
    surfaceTint       = PulsePrimary,
    inverseSurface    = PulseText,
    inverseOnSurface  = PulseBg,

    error             = PulseRed,
    onError           = PulseBg,
    errorContainer    = PulseSurface2,
    onErrorContainer  = PulseRed,

    outline           = PulseBorderStrong,
    outlineVariant    = PulseBorder,

    scrim             = PulseBg,
)

@Composable
fun PulseTheme(
    @Suppress("UNUSED_PARAMETER") darkTheme: Boolean = true,  // v1 dark only
    content: @Composable () -> Unit,
) {
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            // Status bar = bg, light icons (because dark theme)
            window.statusBarColor = PulseBg.toArgb()
            window.navigationBarColor = PulseBg2.toArgb()
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = false
                isAppearanceLightNavigationBars = false
            }
        }
    }
    MaterialTheme(
        colorScheme = PulseColorScheme,
        typography = PulseTypography,
        shapes = PulseShapes,
        content = content,
    )
}
