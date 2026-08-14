/*
 * PrimaryButton — full-width 46px button with loading state.
 *
 * Loading state swaps the label for "{verb}ing…" + a small spinner dot. The dot
 * is a single rotating circle (no third-party lib needed) for v1.
 */
package com.pulse.android.ui.auth.components

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.unit.dp
import com.pulse.android.theme.PulseOnPrimary
import com.pulse.android.theme.PulsePrimary
import com.pulse.android.theme.PulseSurface2

@Composable
fun PrimaryButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    isLoading: Boolean = false,
    isEnabled: Boolean = true,
    loadingLabel: String? = null,
    isGhost: Boolean = false,
) {
    val displayLabel = if (isLoading) (loadingLabel ?: "$label…") else label
    val bg = when {
        isGhost -> androidx.compose.ui.graphics.Color.Transparent
        isEnabled && !isLoading -> PulsePrimary
        else -> PulseSurface2
    }
    val borderColor = if (isGhost) PulseSurface2 else androidx.compose.ui.graphics.Color.Transparent
    val textColor = when {
        isGhost -> com.pulse.android.theme.PulseTextMuted
        isEnabled -> PulseOnPrimary
        else -> com.pulse.android.theme.PulseTextDim
    }
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(46.dp)
            .background(bg, RoundedCornerShape(0.dp))
            .let { if (isGhost) it.border(1.dp, PulseSurface2, RoundedCornerShape(0.dp)) else it }
            .clickable(enabled = isEnabled && !isLoading, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (isLoading) {
                LoadingSpinner()
            }
            Text(
                text = displayLabel,
                color = textColor,
                style = MaterialTheme.typography.labelLarge,
            )
        }
    }
}

@Composable
private fun LoadingSpinner() {
    val transition = rememberInfiniteTransition(label = "spinner")
    val rotation by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(animation = tween(800), repeatMode = RepeatMode.Restart),
        label = "rotate",
    )
    Box(
        modifier = Modifier
            .size(14.dp)
            .background(com.pulse.android.theme.PulseOnPrimary.copy(alpha = 0.2f), RoundedCornerShape(0.dp))
            .rotate(rotation),
    )
}
