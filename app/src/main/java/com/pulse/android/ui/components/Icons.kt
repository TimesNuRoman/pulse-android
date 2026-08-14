/*
 * Pulse — Icon facade.
 * Re-exports Material Icons Outlined set so the rest of the app imports from one place.
 * These are stroke-based, currentColor — matches the design language.
 *
 * The set we depend on is `androidx.compose.material.icons.extended.OutlinedIcons`.
 * No filled icons in this app except the FAB + and the toggle dot (handled in their
 * own components).
 */
package com.pulse.android.ui.components

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Forum
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Keyboard
import androidx.compose.material.icons.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material.icons.outlined.Menu
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material.icons.outlined.MicNone
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Send
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.Square
import androidx.compose.material.icons.outlined.Stop
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material.icons.outlined.Tag
import androidx.compose.material.icons.outlined.TextFields
import androidx.compose.material.icons.outlined.VolumeUp
import androidx.compose.ui.graphics.vector.ImageVector

/** Re-exported icons used across the app. */
object Icons {
    // Bottom nav
    val Note: ImageVector = Icons.Outlined.Description
    val Chat: ImageVector = Icons.Outlined.Forum
    val Search: ImageVector = Icons.Outlined.Search
    val Settings: ImageVector = Icons.Outlined.Settings

    // Common
    val Back: ImageVector = Icons.Outlined.ArrowBack
    val ChevronLeft: ImageVector = Icons.Outlined.ChevronLeft
    val ChevronRight: ImageVector = Icons.Outlined.ChevronRight
    val More: ImageVector = Icons.Outlined.MoreHoriz
    val Close: ImageVector = Icons.Outlined.Close
    val Plus: ImageVector = Icons.Outlined.Add
    val Menu: ImageVector = Icons.Outlined.Menu
    val CheckSquare: ImageVector = Icons.Outlined.Square
    val Trash: ImageVector = Icons.Outlined.Delete
    val Copy: ImageVector = Icons.Outlined.ContentCopy
    val Link: ImageVector = Icons.Outlined.Link
    val Info: ImageVector = Icons.Outlined.Info
    val GitHub: ImageVector = Icons.Outlined.Tag
    val Public: ImageVector = Icons.Outlined.Public

    // Chat / voice
    val Mic: ImageVector = Icons.Outlined.Mic
    val MicSmall: ImageVector = Icons.Outlined.MicNone
    val Send: ImageVector = Icons.Outlined.Send
    val Speaker: ImageVector = Icons.Outlined.VolumeUp
    val Stop: ImageVector = Icons.Outlined.Stop
    val Shield: ImageVector = Icons.Outlined.Shield

    // Settings rows
    val Skills: ImageVector = Icons.Outlined.AutoAwesome
    val Sync: ImageVector = Icons.Outlined.Sync
    val Card: ImageVector = Icons.Outlined.KeyboardArrowRight  // chevron used as "PRO · Annual →"
    val Moon: ImageVector = Icons.Outlined.Sync
    val Keyboard: ImageVector = Icons.Outlined.Keyboard
    val TextSize: ImageVector = Icons.Outlined.TextFields
    val User: ImageVector = Icons.Outlined.Person

    // Onboarding large
    val LinkLarge: ImageVector = Icons.Outlined.Link
    val MicLarge: ImageVector = Icons.Outlined.Mic
    val SyncLarge: ImageVector = Icons.Outlined.Sync
}
