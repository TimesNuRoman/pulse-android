/*
 * AuthDivider — horizontal line with a centered "or" label.
 * Used between email-password form and OAuth rows (when we add them in v2).
 */
package com.pulse.android.ui.auth.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.pulse.android.theme.PulseBorder
import com.pulse.android.theme.PulseTextDim

@Composable
fun AuthDivider(
    label: String = "or",
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .weight(1f)
                .height(1.dp)
                .background(PulseBorder),
        )
        Text(
            text = label,
            color = PulseTextDim,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(horizontal = 12.dp),
        )
        Box(
            modifier = Modifier
                .weight(1f)
                .height(1.dp)
                .background(PulseBorder),
        )
    }
}
