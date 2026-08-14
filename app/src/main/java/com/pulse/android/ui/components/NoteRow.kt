/*
 * NoteRow — list item for the notes list (and search results, and chat history).
 *
 * Layout (per design spec):
 *   - icon 28x28 (left)
 *   - title 13px medium
 *   - meta  11px dim   "{N} backlinks · {date}"
 *   - chevron right
 *
 * 48dp+ tap target, zero rounded corners.
 */
package com.pulse.android.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.pulse.android.theme.PulseText
import com.pulse.android.theme.PulseTextDim
import com.pulse.android.theme.PulseTextMuted

@Composable
fun NoteRow(
    title: String,
    meta: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector = Icons.Note,
    pinned: Boolean = false,
    onClick: () -> Unit,
    onLongClick: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val clickModifier = if (onLongClick != null) {
        modifier
            .clickable(onClick = onClick)
            // Long press is handled by the parent when needed; not registering a separate
            // long-click here keeps the row simple. Override via the screen if needed.
    } else {
        modifier.clickable(onClick = onClick)
    }
    Row(
        modifier = clickModifier
            .fillMaxWidth()
            .height(56.dp)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier.size(28.dp),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = PulseTextMuted,
                modifier = Modifier.size(20.dp),
            )
        }
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 12.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = if (pinned) "★ $title" else title,
                color = PulseText,
                style = MaterialTheme.typography.titleSmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = meta,
                color = PulseTextDim,
                style = MaterialTheme.typography.labelSmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Icon(
            imageVector = Icons.ChevronRight,
            contentDescription = null,
            tint = PulseTextDim,
            modifier = Modifier.size(16.dp),
        )
    }
}
