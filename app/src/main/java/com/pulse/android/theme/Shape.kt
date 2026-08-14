/*
 * Pulse — Shape tokens.
 * Hard rule: `border-radius: 0` global. No rounded corners on any UI element.
 * Material 3 components default to 4dp/8dp/12dp/16dp/24dp — we override them all
 * to RectangleShape-equivalent zero corners.
 */
package com.pulse.android.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

/** All zero. The "shape" is a square. */
internal val PulseShapes = Shapes(
    extraSmall = RoundedCornerShape(0.dp),
    small      = RoundedCornerShape(0.dp),
    medium     = RoundedCornerShape(0.dp),
    large      = RoundedCornerShape(0.dp),
    extraLarge = RoundedCornerShape(0.dp),
)
