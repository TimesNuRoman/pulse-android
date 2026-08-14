/*
 * Toggle — 36x20, surface-2 bg default, primary on/off state, dot 14x14.
 * Per design rule: filled dot (the only filled icon besides the FAB).
 */
package com.pulse.android.ui.components

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.pulse.android.theme.PulsePrimary
import com.pulse.android.theme.PulseSurface2
import com.pulse.android.theme.PulseText

@Composable
fun PulseToggle(
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val dotXOffset by animateDpAsState(
        targetValue = if (checked) 16.dp else 2.dp,
        animationSpec = tween(durationMillis = 140),
        label = "toggle-dot",
    )
    Box(
        modifier = modifier
            .size(width = 36.dp, height = 20.dp)
            .background(
                color = if (checked) PulsePrimary else PulseSurface2,
                shape = RoundedCornerShape(0.dp),
            )
            .clickable { onCheckedChange(!checked) },
    ) {
        Box(
            modifier = Modifier
                .offset(x = dotXOffset, y = 3.dp)
                .size(14.dp)
                .background(
                    color = if (checked) PulseText else PulseText.copy(alpha = 0.6f),
                    shape = RoundedCornerShape(0.dp),
                )
                .align(Alignment.CenterStart),
        )
    }
}
