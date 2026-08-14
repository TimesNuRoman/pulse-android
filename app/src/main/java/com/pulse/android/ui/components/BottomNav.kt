/*
 * BottomNav — 4 destinations, always visible on Notes / Chat / Search / Settings.
 * Hidden on note editor and modal screens.
 *
 * Tap target 48dp tall (above the 20dp icon container).
 * Active = primary color; inactive = text-dim.
 * No badges / counts in v1.
 */
package com.pulse.android.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.pulse.android.theme.PulsePrimary
import com.pulse.android.theme.PulseSurface
import com.pulse.android.theme.PulseTextDim

enum class NavDestination(
    val route: String,
    val label: String,
    val icon: ImageVector,
) {
    Notes("notes", "Notes", Icons.Note),
    Chat("chat", "Chat", Icons.Chat),
    Search("search", "Search", Icons.Search),
    Settings("settings", "Settings", Icons.Settings),
}

@Composable
fun BottomNav(
    currentRoute: String,
    onSelect: (NavDestination) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(PulseSurface)
            .padding(WindowInsets.navigationBars.asPaddingValues())
            .height(56.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        NavDestination.entries.forEach { dest ->
            val active = currentRoute.startsWith(dest.route)
            NavItem(
                destination = dest,
                active = active,
                onTap = { onSelect(dest) },
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun NavItem(
    destination: NavDestination,
    active: Boolean,
    onTap: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tint = if (active) PulsePrimary else PulseTextDim
    Column(
        modifier = modifier
            .height(48.dp)
            .clickable { onTap() }
            .padding(vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Icon(
            imageVector = destination.icon,
            contentDescription = destination.label,
            tint = tint,
            modifier = Modifier.size(20.dp),
        )
        Text(
            text = destination.label,
            color = tint,
            textAlign = TextAlign.Center,
            style = MaterialTheme.typography.labelSmall,
        )
    }
}
