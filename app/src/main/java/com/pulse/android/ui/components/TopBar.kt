/*
 * TopBar — 40dp tall, supports:
 *   - back button (left, 32x32)
 *   - centered title
 *   - up to 2 right action buttons (32x32 each)
 *
 * No background by default; caller composes it on top of surface.
 * Status bar is rendered by the screen (28dp above the top bar).
 */
package com.pulse.android.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.IconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.pulse.android.theme.PulseText
import com.pulse.android.theme.PulseTextMuted

@Composable
fun TopBar(
    title: String,
    onBack: (() -> Unit)? = null,
    primaryAction: TopBarAction? = null,
    secondaryAction: TopBarAction? = null,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(40.dp)
            .padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Left: back button (fixed 32x32 to keep title centered)
        Box(
            modifier = Modifier.size(40.dp),
            contentAlignment = Alignment.Center,
        ) {
            if (onBack != null) {
                IconButton(onClick = onBack, modifier = Modifier.size(32.dp)) {
                    Icon(
                        imageVector = Icons.Back,
                        contentDescription = "Back",
                        tint = PulseText,
                    )
                }
            }
        }
        // Center: title
        Text(
            text = title,
            color = PulseText,
            textAlign = TextAlign.Center,
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 4.dp),
        )
        // Right: actions
        if (primaryAction != null) {
            ActionButton(action = primaryAction)
        } else {
            Spacer(modifier = Modifier.width(0.dp))
        }
        if (secondaryAction != null) {
            Spacer(modifier = Modifier.width(0.dp))
            ActionButton(action = secondaryAction)
        } else if (primaryAction == null) {
            Spacer(modifier = Modifier.width(40.dp))
        } else {
            // match the onBack width so title stays centered
            Spacer(modifier = Modifier.width(0.dp))
        }
    }
}

@Composable
private fun ActionButton(action: TopBarAction) {
    Box(
        modifier = Modifier.size(40.dp),
        contentAlignment = Alignment.Center,
    ) {
        IconButton(onClick = action.onClick, modifier = Modifier.size(32.dp)) {
            Icon(
                imageVector = action.icon,
                contentDescription = action.contentDescription,
                tint = PulseText,
            )
        }
    }
}

data class TopBarAction(
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
    val contentDescription: String,
    val onClick: () -> Unit,
)
