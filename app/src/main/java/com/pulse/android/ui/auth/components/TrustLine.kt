/*
 * TrustLine — bg-2, 1px border, shield icon left (primary), 11px text.
 * Used on /login + /signup to reinforce "your password is the key" messaging.
 */
package com.pulse.android.ui.auth.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.pulse.android.theme.PulseBorder
import com.pulse.android.theme.PulsePrimary
import com.pulse.android.theme.PulseSurface2
import com.pulse.android.theme.PulseTextMuted
import com.pulse.android.ui.components.Icons

@Composable
fun TrustLine(
    text: String,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(PulseSurface2)
            .border(width = 1.dp, color = PulseBorder)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            imageVector = Icons.Shield,
            contentDescription = null,
            tint = PulsePrimary,
            modifier = Modifier.size(13.dp),
        )
        Text(
            text = text,
            color = PulseTextMuted,
            style = MaterialTheme.typography.labelSmall,
        )
    }
}
