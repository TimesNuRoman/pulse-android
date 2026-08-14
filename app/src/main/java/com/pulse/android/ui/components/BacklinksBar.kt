/*
 * BacklinksBar — bottom-pinned panel on the note editor.
 * Shows the count of notes that link to the current note + a scrollable list of
 * incoming references.
 *
 * 100-200dp tall, scrollable when overflowing.
 * bg-2 (PulseSurface2), 1px primary border top, square corners.
 */
package com.pulse.android.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.pulse.android.theme.PulseBorder
import com.pulse.android.theme.PulsePrimary
import com.pulse.android.theme.PulseSurface2
import com.pulse.android.theme.PulseText
import com.pulse.android.theme.PulseTextMuted

data class Backlink(
    val id: String,
    val title: String,
    val snippet: String = "",
)

@Composable
fun BacklinksBar(
    count: Int,
    backlinks: List<Backlink>,
    maxVisible: Int = 3,
    onOpen: (Backlink) -> Unit,
    onSeeAll: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(PulseSurface2)
            .border(width = 1.dp, color = PulseBorder)
            .heightIn(min = 56.dp, max = 200.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(32.dp)
                .padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(
                imageVector = Icons.Link,
                contentDescription = null,
                tint = PulsePrimary,
                modifier = Modifier.size(14.dp),
            )
            Text(
                text = "Linked from $count notes",
                color = PulseTextMuted,
                style = MaterialTheme.typography.labelSmall,
            )
        }
        if (backlinks.isNotEmpty()) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 130.dp),
            ) {
                items(backlinks.take(maxVisible)) { bl ->
                    BacklinkRow(backlink = bl, onClick = { onOpen(bl) })
                }
                if (onSeeAll != null && backlinks.size > maxVisible) {
                    item {
                        Text(
                            text = "See all (${backlinks.size}) →",
                            color = PulsePrimary,
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onSeeAll() }
                                .padding(horizontal = 14.dp, vertical = 10.dp),
                        )
                    }
                }
            }
        } else {
            Text(
                text = "No backlinks yet — add [[${backlinks.firstOrNull()?.title ?: "this note"}]] in another note.",
                color = PulseTextMuted,
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
            )
        }
    }
}

@Composable
private fun BacklinkRow(backlink: Backlink, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .height(40.dp)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = backlink.title,
            color = PulseText,
            style = MaterialTheme.typography.bodySmall,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = backlink.snippet.take(40),
            color = PulseTextMuted,
            style = MaterialTheme.typography.labelSmall,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
