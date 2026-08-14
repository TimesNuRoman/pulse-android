/*
 * NotesListScreen — home (route /notes).
 *
 * Layout:
 *   - Top bar: "Notes" + search/menu actions
 *   - Always-visible search bar (tap → /search)
 *   - "PINNED" section: 28x28 icon + 13px title + 11px meta + chevron
 *   - "RECENT" section: same row layout, sorted by updatedAt DESC
 *   - Empty state (no notes): centered 64x64 file icon + "No notes yet" + sub
 *   - FAB: 48x48 primary, bottom-right 16/60dp from edges, "+" icon
 *
 * Long-press a row → context menu (Move/Rename/Pin/Unpin/Delete/Copy as markdown).
 */
package com.pulse.android.ui.notes

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons as MaterialIcons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.pulse.android.data.model.Note
import com.pulse.android.theme.PulseAccent
import com.pulse.android.theme.PulseBg
import com.pulse.android.theme.PulsePrimary
import com.pulse.android.theme.PulseSurface
import com.pulse.android.theme.PulseText
import com.pulse.android.theme.PulseTextDim
import com.pulse.android.theme.PulseTextMuted
import com.pulse.android.ui.components.Icons
import com.pulse.android.ui.components.NoteRow
import com.pulse.android.ui.components.TopBar
import com.pulse.android.ui.components.TopBarAction
import java.text.DateFormat
import java.util.Date

@Composable
fun NotesListScreen(
    onOpenNote: (String) -> Unit,
    onOpenSearch: () -> Unit,
    onMenu: () -> Unit = {},
    vm: NotesListViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsState()
    var contextNote by remember { mutableStateOf<Note?>(null) }

    Scaffold(
        containerColor = PulseBg,
        floatingActionButton = {
            Fab(onClick = { vm.create(onOpenNote) })
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            TopBar(
                title = "Notes",
                primaryAction = TopBarAction(
                    icon = Icons.Search,
                    contentDescription = "Search",
                    onClick = onOpenSearch,
                ),
                secondaryAction = TopBarAction(
                    icon = Icons.More,
                    contentDescription = "Menu",
                    onClick = onMenu,
                ),
            )
            SearchEntry(onClick = onOpenSearch, count = state.total)
            if (state.total == 0) {
                EmptyState()
            } else {
                NoteSections(
                    pinned = state.pinned,
                    recent = state.recent,
                    onOpen = onOpenNote,
                    onLongPress = { contextNote = it },
                )
            }
        }
    }

    contextNote?.let { note ->
        val ctx = androidx.compose.ui.platform.LocalContext.current
        RowContextMenu(
            note = note,
            onDismiss = { contextNote = null },
            onPin = { vm.togglePin(note); contextNote = null },
            onCopy = {
                val clip = android.content.ClipData.newPlainText("note", note.body)
                val cm = ctx.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                cm.setPrimaryClip(clip)
                contextNote = null
            },
            onDelete = {
                // hook into repo via a separate lambda; left as TODO
                contextNote = null
            },
        )
    }
}

@Composable
private fun SearchEntry(onClick: () -> Unit, count: Int) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 8.dp)
            .background(PulseSurface)
            .height(40.dp)
            .clickable { onClick() }
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(imageVector = Icons.Search, contentDescription = null, tint = PulseTextMuted, modifier = Modifier.size(16.dp))
        Spacer(modifier = Modifier.size(8.dp))
        Text(
            text = "Search $count notes…",
            color = PulseTextMuted,
            style = MaterialTheme.typography.bodyMedium.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace),
        )
    }
}

@Composable
private fun NoteSections(
    pinned: List<Note>,
    recent: List<Note>,
    onOpen: (String) -> Unit,
    onLongPress: (Note) -> Unit,
) {
    LazyColumn(modifier = Modifier.fillMaxSize()) {
        if (pinned.isNotEmpty()) {
            item { SectionHead("Pinned") }
            items(pinned, key = { it.id }) { n ->
                NoteRow(
                    title = n.title.ifBlank { "Untitled" },
                    meta = noteMeta(n),
                    pinned = true,
                    onClick = { onOpen(n.id) },
                )
            }
        }
        if (recent.isNotEmpty()) {
            item { SectionHead("Recent") }
            items(recent, key = { it.id }) { n ->
                NoteRow(
                    title = n.title.ifBlank { "Untitled" },
                    meta = noteMeta(n),
                    onClick = { onOpen(n.id) },
                )
            }
        }
        item { Spacer(modifier = Modifier.height(80.dp)) }
    }
}

private fun noteMeta(n: Note): String {
    val date = DateFormat.getDateInstance(DateFormat.MEDIUM).format(Date(n.updatedAt))
    return "${n.backlinkCount} backlinks · $date"
}

@Composable
private fun SectionHead(title: String) {
    Text(
        text = title.uppercase(),
        color = PulseTextDim,
        style = MaterialTheme.typography.labelSmall,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 12.dp),
    )
}

@Composable
private fun EmptyState() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(28.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .background(PulseSurface, RoundedCornerShape(0.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(imageVector = Icons.Note, contentDescription = null, tint = PulseTextMuted, modifier = Modifier.size(28.dp))
            }
            Text("No notes yet", color = PulseText, style = MaterialTheme.typography.titleMedium)
            Text("Tap + to create your first note", color = PulseTextDim, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun Fab(onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(48.dp)
            .background(PulsePrimary, RoundedCornerShape(0.dp))
            .clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = Icons.Plus,
            contentDescription = "New note",
            tint = PulseBg,
            modifier = Modifier.size(20.dp),
        )
    }
}

@Composable
private fun RowContextMenu(
    note: Note,
    onDismiss: () -> Unit,
    onPin: () -> Unit,
    onCopy: () -> Unit,
    onDelete: () -> Unit,
) {
    DropdownMenu(expanded = true, onDismissRequest = onDismiss) {
        DropdownMenuItem(text = { Text(if (note.pinned) "Unpin" else "Pin") }, onClick = onPin)
        DropdownMenuItem(text = { Text("Copy as markdown") }, onClick = onCopy)
        DropdownMenuItem(text = { Text("Delete") }, onClick = onDelete)
    }
}
