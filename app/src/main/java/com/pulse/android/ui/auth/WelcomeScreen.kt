/*
 * WelcomeScreen — entry point of the auth flow.
 *
 * Layout per design spec:
 *   - No top bar.
 *   - Centered vertical: Pulse logo (64×64) + "Pulse" wordmark + 14px muted subhead
 *     + 2 stacked CTAs (Create / I already have one).
 *   - "Create account" → /signup
 *   - "I already have one" → /login
 *
 * AuthNavGraph handles the gate: if a session is already present, this screen
 * is never reached.
 */
package com.pulse.android.ui.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import com.pulse.android.theme.PulseBg
import com.pulse.android.theme.PulsePrimary
import com.pulse.android.theme.PulseSurface
import com.pulse.android.theme.PulseText
import com.pulse.android.theme.PulseTextMuted
import com.pulse.android.ui.auth.components.PrimaryButton

@Composable
fun WelcomeScreen(
    onCreateAccount: () -> Unit,
    onLogin: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(PulseBg)
            .padding(horizontal = 24.dp, vertical = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Spacer(modifier = Modifier.weight(1f))
        Box(
            modifier = Modifier
                .size(64.dp)
                .background(PulsePrimary, RoundedCornerShape(0.dp)),
            contentAlignment = Alignment.Center,
        ) {
            // Pulse logo: a circle + a small wave + a dot.
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .background(PulseBg, RoundedCornerShape(0.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = com.pulse.android.ui.components.Icons.Link,
                    contentDescription = null,
                    tint = PulsePrimary,
                    modifier = Modifier.size(20.dp),
                )
            }
        }
        Spacer(modifier = Modifier.height(20.dp))
        Text("Pulse", color = PulseText, style = MaterialTheme.typography.headlineSmall)
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Local-first notes and AI chat. Your data stays on your device, end-to-end encrypted.",
            color = PulseTextMuted,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(horizontal = 32.dp),
        )
        Spacer(modifier = Modifier.height(40.dp))
        PrimaryButton(label = "Create account", onClick = onCreateAccount)
        Spacer(modifier = Modifier.height(8.dp))
        PrimaryButton(
            label = "I already have one",
            onClick = onLogin,
            isEnabled = true,
            isGhost = true,
        )
        Spacer(modifier = Modifier.weight(1.4f))
        // Bottom hint
        Text(
            text = "No account on this device yet.",
            color = com.pulse.android.theme.PulseTextDim,
            style = MaterialTheme.typography.labelSmall,
        )
    }
}
