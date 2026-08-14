/*
 * SettingsScreen — 4 grouped sections (Sync / App / Account / About) per the design spec.
 * Each row: 28x28 icon (left, primary-tinted bg), title 13px, meta 11px dim, optional toggle/chevron.
 */
package com.pulse.android.ui.settings

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.pulse.android.BuildConfig
import com.pulse.android.theme.PulseBg
import com.pulse.android.theme.PulseBorder
import com.pulse.android.theme.PulsePrimary
import com.pulse.android.theme.PulseSurface2
import com.pulse.android.theme.PulseText
import com.pulse.android.theme.PulseTextDim
import com.pulse.android.theme.PulseTextMuted
import com.pulse.android.ui.components.Icons
import com.pulse.android.ui.components.PulseToggle
import com.pulse.android.ui.components.TopBar

@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onOpenSkills: () -> Unit = {},
    vm: SettingsViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsState()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(PulseBg),
    ) {
        TopBar(title = "Settings", onBack = onBack)
        LazyColumn(modifier = Modifier.fillMaxSize()) {
            item { SectionHead("Sync") }
            item {
                ToggleRow(
                    icon = Icons.Sync,
                    title = "Sync is on",
                    meta = "3 devices · last sync 2m ago",
                    checked = state.syncEnabled,
                    onCheckedChange = vm::setSync,
                )
            }
            item {
                ChevronRow(
                    icon = Icons.Card,
                    title = "PRO · Annual",
                    meta = state.proRenewsAt?.let { "renews $it" } ?: "tap to upgrade",
                    onClick = { /* open web /account/billing/ */ },
                )
            }
            item { SectionHead("App") }
            item {
                ChevronRow(
                    icon = Icons.Moon,
                    title = "Theme",
                    meta = "Dark · Tokyo Night",
                    onClick = {},
                )
            }
            item {
                ChevronRow(
                    icon = Icons.Skills,
                    title = "Skills",
                    meta = "Saved prompts · auto-injected",
                    onClick = onOpenSkills,
                )
            }
            item {
                ToggleRow(
                    icon = Icons.MicSmall,
                    title = "Voice input",
                    meta = "STT · local · on",
                    checked = state.voiceEnabled,
                    onCheckedChange = vm::setVoice,
                )
            }
            item {
                ChevronRow(
                    icon = Icons.Keyboard,
                    title = "Editor font",
                    meta = "JetBrains Mono",
                    onClick = {},
                )
            }
            item {
                ChevronRow(
                    icon = Icons.TextSize,
                    title = "Editor text size",
                    meta = "Medium",
                    onClick = {},
                )
            }
            item { SectionHead("Account") }
            item {
                ChevronRow(
                    icon = Icons.User,
                    title = "${state.accountName} · ${state.accountEmail}",
                    meta = "Manage profile in web",
                    onClick = {},
                )
            }
            item { SectionHead("About") }
            item {
                ChevronRow(
                    icon = Icons.Info,
                    title = "Version",
                    meta = "v${BuildConfig.VERSION_NAME}",
                    onClick = {},
                )
            }
            item {
                ChevronRow(
                    icon = Icons.GitHub,
                    title = "Source",
                    meta = "Release notes",
                    onClick = {},
                )
            }
            item { Spacer(modifier = Modifier.height(80.dp)) }
        }
    }
}

@Composable
private fun SectionHead(title: String) {
    Text(
        text = title.uppercase(),
        color = PulseTextDim,
        style = MaterialTheme.typography.labelSmall.copy(letterSpacing = androidx.compose.ui.unit.TextUnit(0.08f, androidx.compose.ui.unit.TextUnitType.Em)),
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 12.dp),
    )
}

@Composable
private fun ToggleRow(
    icon: ImageVector,
    title: String,
    meta: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(28.dp)
                .background(PulsePrimary, androidx.compose.foundation.shape.RoundedCornerShape(0.dp))
                .clip(androidx.compose.foundation.shape.RoundedCornerShape(0.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = PulseBg,
                modifier = Modifier.size(16.dp),
            )
        }
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, color = PulseText, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(meta, color = PulseTextDim, style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        PulseToggle(checked = checked, onCheckedChange = onCheckedChange)
    }
}

@Composable
private fun ChevronRow(
    icon: ImageVector,
    title: String,
    meta: String,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp)
            .clickable { onClick() }
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier.size(28.dp),
            contentAlignment = Alignment.Center,
        ) {
            Icon(imageVector = icon, contentDescription = null, tint = PulseTextMuted, modifier = Modifier.size(20.dp))
        }
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, color = PulseText, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(meta, color = PulseTextDim, style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Icon(imageVector = Icons.ChevronRight, contentDescription = null, tint = PulseTextDim, modifier = Modifier.size(16.dp))
    }
}
