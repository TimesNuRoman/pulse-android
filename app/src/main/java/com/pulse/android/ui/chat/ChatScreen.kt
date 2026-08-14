/*
 * ChatScreen — AI chat with PRO-gated server models + local LLM fallback.
 *
 *   - Top bar: history (drawer) + model selector (dropdown) + usage chip + menu
 *   - License banner above the messages when the user picks a PRO model
 *     without a PRO license, or when the local model isn't loaded.
 *   - Messages: right-aligned user (surface-2), left-aligned assistant (surface + border)
 *   - Composer: mic + input + send (or stop while generating)
 *   - Empty state: copy varies by license tier; a11y-friendly (aria-live region)
 *   - Chat history drawer: full-height panel, slide-in from left
 *
 * Bottom nav visible.
 *
 * Keyboard shortcut: Cmd+K (or Ctrl+K on tablets) focuses the composer. The
 * Activity handles the key event and passes the focus requester in via a
 * remember{} — see MainActivity.kt.
 */
package com.pulse.android.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.pulse.android.MainActivity
import com.pulse.android.data.model.ChatMessage
import com.pulse.android.theme.PulseAccent
import com.pulse.android.theme.PulseBg
import com.pulse.android.theme.PulseBorder
import com.pulse.android.theme.PulsePrimary
import com.pulse.android.theme.PulseRed
import com.pulse.android.theme.PulseSurface
import com.pulse.android.theme.PulseSurface2
import com.pulse.android.theme.PulseText
import com.pulse.android.theme.PulseTextDim
import com.pulse.android.theme.PulseTextMuted
import com.pulse.android.ui.components.Icons
import com.pulse.android.ui.components.TopBar
import com.pulse.android.ui.components.TopBarAction

@Composable
fun ChatScreen(
    onRequestVoice: () -> Unit,
    onOpenNote: (String) -> Unit,
    vm: ChatViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsState()
    val listState = rememberLazyListState()
    val composerFocus = remember { FocusRequester() }
    val lastFocusTick = remember { mutableStateOf(0L) }
    val focusTick by MainActivity.chatFocusRequest.collectAsState()
    LaunchedEffect(focusTick) {
        if (focusTick > lastFocusTick.value) {
            lastFocusTick.value = focusTick
            runCatching { composerFocus.requestFocus() }
        }
    }

    LaunchedEffect(state.messages.size) {
        if (state.messages.isNotEmpty()) listState.animateScrollToItem(state.messages.size - 1)
    }

    Scaffold(containerColor = PulseBg) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            ChatTopBar(
                model = state.model,
                modelConnected = state.modelConnected,
                usageText = formatUsage(state.usage),
                onHistory = { vm.toggleDrawer(true) },
                onSelectModel = vm::switchModel,
                availableModels = state.availableModels,
                onMenu = { vm.newChat() },
            )
            if (state.licenseBanner != null) {
                LicenseBannerRow(
                    banner = state.licenseBanner!!,
                    onDismiss = { vm.dismissLicenseBanner() },
                    onSignIn = { /* future: navigate to auth gate */ },
                )
            }
            if (state.messages.isEmpty()) {
                EmptyState(
                    isPro = state.license.isPro,
                    onSuggestion = { vm.setInput(it) },
                )
            } else {
                LazyColumn(
                    state = listState,
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 8.dp)
                        .semantics { liveRegion = LiveRegionMode.Polite },
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(state.messages, key = { it.id }) { msg ->
                        MessageBubble(msg = msg, onOpenNote = onOpenNote)
                    }
                }
            }
            Composer(
                input = state.input,
                onInput = vm::setInput,
                onSend = vm::send,
                onMic = onRequestVoice,
                generating = state.isGenerating,
                onStop = vm::stop,
                focusRequester = composerFocus,
                webSearchOn = state.webSearchOn,
                onToggleWeb = vm::toggleWebSearch,
            )
        }
    }

    if (state.drawerOpen) {
        ChatHistoryDrawer(
            conversations = state.history,
            currentId = state.conversationId,
            onPick = vm::openConversation,
            onNew = vm::newChat,
            onClear = vm::clearHistory,
            onClose = { vm.toggleDrawer(false) },
        )
    }
}

// -----------------------------------------------------------------------------
// Top bar with model selector + usage chip
// -----------------------------------------------------------------------------

@Composable
private fun ChatTopBar(
    model: ChatModel,
    modelConnected: Boolean,
    usageText: String?,
    onHistory: () -> Unit,
    onSelectModel: (ChatModel) -> Unit,
    availableModels: List<com.pulse.android.data.api.ModelInfo>,
    onMenu: () -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(PulseSurface)
            .padding(horizontal = 4.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onHistory) {
            Icon(imageVector = Icons.Menu, contentDescription = "History", tint = PulseText)
        }
        // Model selector
        Box {
            Row(
                modifier = Modifier
                    .clickable { menuOpen = true }
                    .padding(horizontal = 8.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "${model.label} · ${if (modelConnected) "connected" else "offline"}",
                    color = if (model == ChatModel.ServerLlama70B) PulsePrimary else PulseText,
                    style = MaterialTheme.typography.bodySmall.copy(
                        fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                    ),
                )
                Icon(
                    imageVector = Icons.ChevronLeft,   // chevron-down
                    contentDescription = null,
                    tint = PulseTextMuted,
                    modifier = Modifier
                        .size(14.dp)
                        .padding(start = 4.dp),
                )
            }
            DropdownMenu(
                expanded = menuOpen,
                onDismissRequest = { menuOpen = false },
            ) {
                ChatModel.entries.forEach { m ->
                    val info = availableModels.firstOrNull { it.id == m.id }
                    val label = info?.displayName ?: m.label
                    DropdownMenuItem(
                        text = {
                            Text(
                                text = label,
                                color = if (m == model) PulsePrimary else PulseText,
                                style = MaterialTheme.typography.bodySmall,
                            )
                        },
                        onClick = {
                            onSelectModel(m)
                            menuOpen = false
                        },
                    )
                }
            }
        }
        Spacer(modifier = Modifier.weight(1f))
        if (usageText != null) {
            Box(
                modifier = Modifier
                    .background(PulseSurface2, RoundedCornerShape(0.dp))
                    .padding(horizontal = 8.dp, vertical = 4.dp),
            ) {
                Text(
                    text = usageText,
                    color = PulseTextMuted,
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                    ),
                )
            }
        }
        IconButton(onClick = onMenu) {
            Icon(imageVector = Icons.More, contentDescription = "Menu", tint = PulseText)
        }
    }
}

private fun formatUsage(usage: com.pulse.android.data.api.UsageInfo?): String? {
    if (usage == null) return null
    val used = formatNeurons(usage.neuronsUsed)
    val limit = if (usage.limit < 0) "∞" else formatNeurons(usage.limit)
    return "$used / $limit today"
}

private fun formatNeurons(n: Long): String = when {
    n < 1_000 -> n.toString()
    n < 1_000_000 -> "${n / 1_000}k"
    else -> "%.1fM".format(n / 1_000_000.0)
}

// -----------------------------------------------------------------------------
// License banner
// -----------------------------------------------------------------------------

@Composable
private fun LicenseBannerRow(
    banner: LicenseBanner,
    onDismiss: () -> Unit,
    onSignIn: () -> Unit,
) {
    val (text, cta) = when (banner) {
        LicenseBanner.ProRequired ->
            "Cloud AI is PRO. Local models will be available soon." to "Sign in"
        LicenseBanner.ProExpired ->
            "Your PRO license has expired. Sign in again to renew." to "Sign in"
        LicenseBanner.LocalUnavailable ->
            "Local model isn't loaded yet. Open Settings → Model to download." to "Open Settings"
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(PulseSurface2)
            .border(1.dp, PulseBorder)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = text,
            color = PulseTextMuted,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.weight(1f),
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = cta,
            color = PulsePrimary,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier
                .clickable { onSignIn() }
                .padding(horizontal = 4.dp, vertical = 2.dp),
        )
        Text(
            text = "Dismiss",
            color = PulseTextDim,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier
                .clickable { onDismiss() }
                .padding(horizontal = 4.dp, vertical = 2.dp),
        )
    }
}

// -----------------------------------------------------------------------------
// Empty state
// -----------------------------------------------------------------------------

@Composable
private fun EmptyState(
    isPro: Boolean,
    onSuggestion: (String) -> Unit,
) {
    val subhead = if (isPro) {
        "PRO · cloud models + your local notes."
    } else {
        "AI responses stay on your device. Cloud models available with PRO."
    }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(28.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(
                modifier = Modifier
                    .size(80.dp)
                    .background(PulseSurface, RoundedCornerShape(0.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(imageVector = Icons.Chat, contentDescription = null, tint = PulseTextMuted, modifier = Modifier.size(40.dp))
            }
            Text("Ask anything about your notes", color = PulseText, style = MaterialTheme.typography.titleMedium)
            Text(
                text = subhead,
                color = PulseTextMuted,
                style = MaterialTheme.typography.bodySmall,
            )
            Spacer(modifier = Modifier.height(8.dp))
            listOf(
                "Summarise my notes",
                "What did I write about Pulse?",
                "Find backlinks to Pulse web",
                "Make a plan for next week",
            ).forEach { sug ->
                Box(
                    modifier = Modifier
                        .background(PulseSurface2, RoundedCornerShape(0.dp))
                        .clickable { onSuggestion(sug) }
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                ) {
                    Text(sug, color = PulseTextMuted, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

// -----------------------------------------------------------------------------
// Message bubble + composer
// -----------------------------------------------------------------------------

@Composable
private fun MessageBubble(msg: ChatMessage, onOpenNote: (String) -> Unit) {
    val isUser = msg.role == "user"
    val bubbleColor = if (isUser) PulseSurface2 else PulseSurface
    val border = if (!isUser) Modifier.border(1.dp, PulseBorder) else Modifier
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start,
    ) {
        Box(
            modifier = Modifier
                .widthIn(max = 280.dp)
                .then(border)
                .background(bubbleColor, RoundedCornerShape(0.dp))
                .padding(horizontal = 12.dp, vertical = 8.dp),
        ) {
            Text(
                text = msg.content.ifBlank { "…" },
                color = if (isUser) PulseText else PulseTextMuted,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}

@Composable
private fun Composer(
    input: String,
    onInput: (String) -> Unit,
    onSend: () -> Unit,
    onMic: () -> Unit,
    generating: Boolean,
    onStop: () -> Unit,
    focusRequester: FocusRequester? = null,
    webSearchOn: Boolean = false,
    onToggleWeb: (Boolean) -> Unit = {},
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(PulseSurface)
            .imePadding()
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onMic) {
            Icon(imageVector = Icons.Mic, contentDescription = "Voice", tint = PulseTextMuted)
        }
        IconButton(onClick = { onToggleWeb(!webSearchOn) }) {
            Icon(
                imageVector = Icons.Public,
                contentDescription = "Web search",
                tint = if (webSearchOn) PulsePrimary else PulseTextMuted,
            )
        }
        TextField(
            value = input,
            onValueChange = onInput,
            placeholder = { Text("Ask anything…", color = PulseTextMuted) },
            singleLine = false,
            colors = TextFieldDefaults.colors(
                focusedContainerColor = Color.Transparent,
                unfocusedContainerColor = Color.Transparent,
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent,
                cursorColor = PulsePrimary,
                focusedTextColor = PulseText,
                unfocusedTextColor = PulseText,
            ),
            modifier = Modifier
                .weight(1f)
                .heightIn(min = 40.dp, max = 120.dp)
                .let { if (focusRequester != null) it.focusRequester(focusRequester) else it },
        )
        if (generating) {
            IconButton(onClick = onStop) {
                Icon(imageVector = Icons.Stop, contentDescription = "Stop", tint = PulseRed)
            }
        } else {
            IconButton(
                onClick = onSend,
                enabled = input.isNotBlank(),
            ) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .background(
                            if (input.isNotBlank()) PulsePrimary else PulseSurface2,
                            RoundedCornerShape(0.dp),
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Send,
                        contentDescription = "Send",
                        tint = if (input.isNotBlank()) PulseBg else PulseTextDim,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
        }
    }
}
