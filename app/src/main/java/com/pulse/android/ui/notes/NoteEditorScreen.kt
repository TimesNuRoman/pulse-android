/*
 * NoteEditorScreen — full-screen note editor.
 *
 *   - Top bar: back, title (slightly dim), 3-dot menu (Insert link / Add checkbox / Export / Delete)
 *   - Body: title 22px bold, then markdown body in monospace (source mode) or rendered prose
 *   - Bottom: BacklinksBar (100-200dp tall, scrollable, shows count + first 3 sources + "See all (N) →")
 *
 * No bottom nav (the editor is a focused surface).
 */
package com.pulse.android.ui.notes

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons as MaterialIcons
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.pulse.android.theme.PulseBg
import com.pulse.android.theme.PulseBorder
import com.pulse.android.theme.PulsePrimary
import com.pulse.android.theme.PulseSurface
import com.pulse.android.theme.PulseText
import com.pulse.android.theme.PulseTextDim
import com.pulse.android.ui.components.BacklinksBar
import com.pulse.android.ui.components.Icons
import com.pulse.android.ui.components.TopBar
import com.pulse.android.ui.components.TopBarAction
import com.pulse.android.util.highlightedPreview
import kotlinx.coroutines.delay

@Composable
fun NoteEditorScreen(
    onBack: () -> Unit,
    onOpenLink: (String) -> Unit,
    onRequestVoice: () -> Unit = {},
    vm: NoteEditorViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsState()
    var menuOpen by remember { mutableStateOf(false) }
    var deleteOpen by remember { mutableStateOf(false) }
    var renderMode by remember { mutableStateOf(true) }  // true = source (mono), false = preview (prose)
    var acOpen by remember { mutableStateOf(false) }
    var acQuery by remember { mutableStateOf("") }
    var bodyCursor by remember { mutableStateOf(0) }
    val scroll = rememberScrollState()

    LaunchedEffect(state.body) {
        // detect `[[` and toggle autocomplete
        val text = state.body
        val cursor = bodyCursor.coerceAtMost(text.length)
        val upTo = text.substring(0, cursor)
        val open = upTo.lastIndexOf("[[") >= 0 &&
            !upTo.substring(upTo.lastIndexOf("[[")).contains("]]")
        if (open) {
            val start = upTo.lastIndexOf("[[") + 2
            acQuery = upTo.substring(start)
            acOpen = true
        } else {
            acOpen = false
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(PulseBg)
            .imePadding(),
    ) {
        TopBar(
            title = state.title.ifBlank { "New note" },
            onBack = onBack,
            primaryAction = TopBarAction(
                icon = Icons.More,
                contentDescription = "Menu",
                onClick = { menuOpen = true },
            ),
        )
        HorizontalDivider(thickness = 1.dp, color = PulseBorder)

        // Scrollable body
        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 14.dp)
                    .verticalScroll(scroll)
                    .padding(vertical = 12.dp),
            ) {
                BasicTextField(
                    value = state.title,
                    onValueChange = vm::setTitle,
                    singleLine = true,
                    textStyle = TextStyle(
                        color = PulseText,
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                    ),
                    cursorBrush = androidx.compose.ui.graphics.SolidColor(PulsePrimary),
                    decorationBox = { inner ->
                        if (state.title.isEmpty()) {
                            Text(
                                text = "Untitled",
                                color = PulseTextDim,
                                style = TextStyle(fontSize = 22.sp, fontWeight = FontWeight.Bold),
                            )
                        }
                        inner()
                    },
                )
                Spacer(modifier = Modifier.height(12.dp))
                if (renderMode) {
                    BasicTextField(
                        value = state.body,
                        onValueChange = { v ->
                            vm.setBody(v)
                            bodyCursor = v.length  // approximate; real cursor tracking would need TextFieldValue
                        },
                        textStyle = TextStyle(
                            color = PulseText,
                            fontSize = 14.sp,
                            fontFamily = FontFamily.Monospace,
                            lineHeight = 22.sp,
                        ),
                        cursorBrush = androidx.compose.ui.graphics.SolidColor(PulsePrimary),
                        decorationBox = { inner ->
                            if (state.body.isEmpty()) {
                                Text(
                                    text = "Start writing…",
                                    color = PulseTextDim,
                                    style = TextStyle(
                                        fontSize = 14.sp,
                                        fontFamily = FontFamily.Monospace,
                                    ),
                                )
                            }
                            inner()
                        },
                    )
                } else {
                    Text(
                        text = highlightedPreview(state.body),
                        style = TextStyle(
                            color = PulseText,
                            fontSize = 14.sp,
                            lineHeight = 22.sp,
                        ),
                    )
                }
            }
        }

        // Backlinks
        BacklinksBar(
            count = state.backlinkCount,
            backlinks = state.backlinks.map { com.pulse.android.ui.components.Backlink(it.id, it.title, it.snippet) },
            onOpen = { onOpenLink(it.id) },
        )

        // Top-bar overflow menu
        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
            DropdownMenuItem(
                text = { Text("Insert [[link]]") },
                onClick = {
                    menuOpen = false
                    // Open autocomplete with empty query by inserting [[ and re-positioning
                    vm.setBody(state.body + "[[")
                    acOpen = true
                    acQuery = ""
                },
            )
            DropdownMenuItem(
                text = { Text("Add checkbox") },
                onClick = {
                    menuOpen = false
                    vm.insertAtCursor("\n- [ ] ", state.body.length)
                },
            )
            DropdownMenuItem(
                text = { Text("Switch to ${if (renderMode) "preview" else "source"}") },
                onClick = {
                    menuOpen = false
                    renderMode = !renderMode
                },
            )
            DropdownMenuItem(
                text = { Text("Voice input") },
                onClick = {
                    menuOpen = false
                    onRequestVoice()
                },
            )
            DropdownMenuItem(
                text = { Text("Delete", color = com.pulse.android.theme.PulseRed) },
                onClick = {
                    menuOpen = false
                    deleteOpen = true
                },
            )
        }
    }

    if (acOpen) {
        com.pulse.android.ui.notes.LinkAutocomplete(
            query = acQuery,
            onPick = { title ->
                // Replace the open `[[query` with `[[title]] `
                val text = state.body
                val cursor = bodyCursor.coerceAtMost(text.length)
                val upTo = text.substring(0, cursor)
                val openIdx = upTo.lastIndexOf("[[")
                if (openIdx >= 0) {
                    val before = text.substring(0, openIdx)
                    val after = text.substring(cursor)
                    val newBody = "$before[[$title]] $after"
                    vm.setBody(newBody)
                }
                acOpen = false
            },
            onDismiss = { acOpen = false },
        )
    }

    if (deleteOpen) {
        AlertDialog(
            onDismissRequest = { deleteOpen = false },
            title = { Text("Delete this note?") },
            text = { Text("This cannot be undone.") },
            confirmButton = {
                TextButton(onClick = {
                    deleteOpen = false
                    vm.delete(onBack)
                }) { Text("Delete", color = com.pulse.android.theme.PulseRed) }
            },
            dismissButton = {
                TextButton(onClick = { deleteOpen = false }) { Text("Cancel") }
            },
            shape = RoundedCornerShape(0.dp),
        )
    }
}

private fun Modifier.verticalScrollState(state: androidx.compose.foundation.ScrollState): Modifier =
    Modifier.verticalScroll(state)
