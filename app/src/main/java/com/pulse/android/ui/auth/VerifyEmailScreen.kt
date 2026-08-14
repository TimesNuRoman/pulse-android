/*
 * VerifyEmailScreen — /verify?token=... route.
 *
 * Layout per spec:
 *   - No back; close button (×) on the right
 *   - Centered 56×56 green check icon
 *   - "Check your email" headline
 *   - Email in a mono code-style box
 *   - Primary "📧 Open email app" button → deep link
 *   - "Didn't get it? Resend" link (with "Sent ✓" feedback for 4s)
 *   - Tip block at the bottom
 *
 * Polling: every 5s, calls /check-verified; navigates to /notes when verified.
 */
package com.pulse.android.ui.auth

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.pulse.android.theme.PulseAccent
import com.pulse.android.theme.PulseBg
import com.pulse.android.theme.PulseBorder
import com.pulse.android.theme.PulseGreen
import com.pulse.android.theme.PulsePrimary
import com.pulse.android.theme.PulseSurface
import com.pulse.android.theme.PulseSurface2
import com.pulse.android.theme.PulseText
import com.pulse.android.theme.PulseTextDim
import com.pulse.android.theme.PulseTextMuted
import com.pulse.android.ui.auth.components.TrustLine
import com.pulse.android.ui.components.Icons
import com.pulse.android.ui.components.TopBar
import com.pulse.android.ui.components.TopBarAction

@Composable
fun VerifyEmailScreen(
    email: String,
    onClose: () -> Unit,
    onVerified: () -> Unit,
    vm: VerifyEmailViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsState()
    val ctx = LocalContext.current

    LaunchedEffect(email) { vm.start(email) }
    LaunchedEffect(state.navigateToNotes) {
        if (state.navigateToNotes) {
            onVerified()
            vm.consumeNavigation()
        }
    }
    DisposableEffectStop(vm)

    Column(
        modifier = Modifier.fillMaxSize().background(PulseBg),
    ) {
        TopBar(
            title = "Verify email",
            onBack = null,
            primaryAction = TopBarAction(
                icon = Icons.Close,
                contentDescription = "Close",
                onClick = onClose,
            ),
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Spacer(modifier = Modifier.height(40.dp))
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .background(PulseGreen, RoundedCornerShape(0.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.CheckSquare,
                    contentDescription = null,
                    tint = PulseSurface2,
                    modifier = Modifier.size(28.dp),
                )
            }
            Text("Check your email", color = PulseText, style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center)
            Text(
                text = "We sent a verification link to",
                color = PulseTextMuted,
                style = MaterialTheme.typography.bodySmall,
            )
            Box(
                modifier = Modifier
                    .background(PulseSurface2, RoundedCornerShape(0.dp))
                    .padding(horizontal = 10.dp, vertical = 6.dp),
            ) {
                Text(
                    text = state.email.ifEmpty { email },
                    color = PulseText,
                    style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                )
            }
            Text(
                text = "Click it within 24 hours to activate.",
                color = PulseTextMuted,
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(46.dp)
                    .background(PulsePrimary, RoundedCornerShape(0.dp))
                    .clickable {
                        val url = vm.emailAppUrl()
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                        runCatching { ctx.startActivity(intent) }
                    },
                contentAlignment = Alignment.Center,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("📧  ", color = PulseBg, style = MaterialTheme.typography.labelLarge)
                    Text("Open email app", color = PulseBg, style = MaterialTheme.typography.labelLarge)
                }
            }
            Row {
                if (state.resendSent) {
                    Text(
                        text = "Sent ✓",
                        color = PulseGreen,
                        style = MaterialTheme.typography.labelSmall,
                    )
                } else {
                    Text(
                        text = if (state.isTimedOut) "Still waiting? " else "Didn't get the email? ",
                        color = PulseTextDim,
                        style = MaterialTheme.typography.labelSmall,
                    )
                    Text(
                        text = "Resend",
                        color = PulsePrimary,
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.clickable { vm.resend() }.padding(horizontal = 2.dp),
                    )
                }
            }
            if (state.isPolling) {
                PollingDots()
            } else if (state.isTimedOut) {
                Text(
                    text = "Polling stopped after 5 minutes. Tap Resend to try again.",
                    color = PulseTextMuted,
                    style = MaterialTheme.typography.labelSmall,
                    textAlign = TextAlign.Center,
                )
            }
            Spacer(modifier = Modifier.weight(1f))
            TrustLine(
                text = "Tip: if it doesn't arrive in 5 minutes, check your spam folder. The link expires after 24 hours.",
            )
        }
    }
}

@Composable
private fun DisposableEffectStop(vm: VerifyEmailViewModel) {
    androidx.compose.runtime.DisposableEffect(vm) {
        onDispose { vm.stop() }
    }
}

@Composable
private fun PollingDots() {
    val transition = rememberInfiniteTransition(label = "verify-dots")
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        repeat(3) { i ->
            val alpha by transition.animateFloat(
                initialValue = 0.3f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    animation = tween(durationMillis = 600, delayMillis = i * 150),
                    repeatMode = RepeatMode.Reverse,
                ),
                label = "dot-$i",
            )
            Box(
                modifier = Modifier
                    .size(4.dp)
                    .background(com.pulse.android.theme.PulseAccent.copy(alpha = alpha)),
            )
        }
    }
}
