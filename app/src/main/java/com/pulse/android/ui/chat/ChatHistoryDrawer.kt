/*
 * ChatHistoryDrawer — slide-in panel from the left.
 * Shows the conversation list, "New chat" button, and a "Clear history" item.
 */
package com.pulse.android.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.pulse.android.data.model.Conversation
import com.pulse.android.theme.PulseBg
import com.pulse.android.theme.PulseBg2
import com.pulse.android.theme.PulseBorder
import com.pulse.android.theme.PulsePrimary
import com.pulse.android.theme.PulseSurface
import com.pulse.android.theme.PulseText
import com.pulse.android.theme.PulseTextDim
import com.pulse.android.theme.PulseTextMuted
import com.pulse.android.ui.components.Icons
import java.text.DateFormat
import java.util.Date

@Composable
fun ChatHistoryDrawer(
    conversations: List<Conversation>,
    currentId: String?,
    onPick: (String) -> Unit,
    onNew: () -> Unit,
    onClear: () -> Unit,
    onClose: () -> Unit,
) {
    Box(modifier = Modifier.fillMaxSize().background(Color(0x66000000))) {
        Surface(
            modifier = Modifier
                .fillMaxHeight()
                .width(280.dp)
                .align(Alignment.CenterStart),
            color = PulseBg2,
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                        .background(PulsePrimary)
                        .clickable { onNew() }
                        .padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(imageVector = Icons.Plus, contentDescription = null, tint = PulseBg, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("New chat", color = PulseBg, style = MaterialTheme.typography.titleSmall)
                }
                LazyColumn(modifier = Modifier.weight(1f)) {
                    items(conversations, key = { it.id }) { conv ->
                        val active = conv.id == currentId
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(if (active) PulseSurface else PulseBg2)
                                .clickable { onPick(conv.id) }
                                .padding(horizontal = 16.dp, vertical = 10.dp),
                        ) {
                            Text(
                                text = conv.title.ifBlank { "New chat" },
                                color = PulseText,
                                style = MaterialTheme.typography.bodySmall,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                text = conv.model ?: "no model · ${DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(conv.lastActiveAt))}",
                                color = PulseTextDim,
                                style = MaterialTheme.typography.labelSmall,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
                TextButton(
                    onClick = onClear,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                ) {
                    Text("Clear history", color = PulseTextMuted)
                }
            }
        }
        Box(
            modifier = Modifier
                .fillMaxSize()
                .clickable { onClose() },
        )
    }
}
