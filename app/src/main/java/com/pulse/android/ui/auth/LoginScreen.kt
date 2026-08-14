/*
 * LoginScreen — /login route.
 *
 * Layout per spec:
 *   - Top bar: back, "Log in" title, "Help" text button
 *   - Centered Pulse brand + "Welcome back" headline + 13px muted sub
 *   - Email field (auto-trim/lowercase on submit, green check on valid)
 *   - Password field with show/hide toggle
 *   - "Forgot password?" right-aligned link
 *   - Primary "Log in" button (disabled until both fields valid)
 *   - Trust line: "Your password is the key..."
 *   - Footer link: "No account? Create one →"
 *   - Inline alert (formError) above the trust line on submit failure
 */
package com.pulse.android.ui.auth

import androidx.compose.animation.core.animateDpAsState
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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.pulse.android.data.api.AuthApi
import com.pulse.android.theme.PulseBg
import com.pulse.android.theme.PulseBorder
import com.pulse.android.theme.PulsePrimary
import com.pulse.android.theme.PulseRed
import com.pulse.android.theme.PulseSurface
import com.pulse.android.theme.PulseSurface2
import com.pulse.android.theme.PulseText
import com.pulse.android.theme.PulseTextMuted
import com.pulse.android.ui.auth.components.AuthField
import com.pulse.android.ui.auth.components.KeyboardType
import com.pulse.android.ui.auth.components.PasswordField
import com.pulse.android.ui.auth.components.PrimaryButton
import com.pulse.android.ui.auth.components.TrustLine
import com.pulse.android.ui.components.Icons
import com.pulse.android.ui.components.TopBar
import com.pulse.android.ui.components.TopBarAction

@Composable
fun LoginScreen(
    onBack: () -> Unit,
    onSuccess: () -> Unit,
    onCreateAccount: () -> Unit,
    onForgot: () -> Unit,
    vm: LoginViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsState()
    val scroll = rememberScrollState()
    val emailValid = state.email.isNotEmpty() && AuthApi.isValidEmail(state.email.trim())

    // Shake offset for the form on error
    var shake by remember { mutableStateOf(0) }
    val shakeOffset by animateDpAsState(
        targetValue = if (shake != 0) if (shake % 2 == 0) 4.dp else (-4).dp else 0.dp,
        animationSpec = tween(80),
        label = "shake",
    )
    LaunchedEffect(state.formError) {
        if (state.formError != null) {
            // Run a quick shake cycle (4 oscillations)
            repeat(4) {
                shake++
                kotlinx.coroutines.delay(80)
            }
        }
    }

    LaunchedEffect(state.navigateToNotes) {
        if (state.navigateToNotes) {
            onSuccess()
            vm.consumeNavigation()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(PulseBg)
            .imePadding(),
    ) {
        TopBar(
            title = "Log in",
            onBack = onBack,
            primaryAction = TopBarAction(
                icon = Icons.Info,
                contentDescription = "Help",
                onClick = { /* open in-app help */ },
            ),
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(scroll)
                .padding(horizontal = 20.dp, vertical = 16.dp)
                .offsetX(shakeOffset),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Spacer(modifier = Modifier.height(8.dp))
            // Pulse brand
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .background(PulsePrimary, RoundedCornerShape(0.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    modifier = Modifier
                        .size(28.dp)
                        .background(PulseBg, RoundedCornerShape(0.dp)),
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
            Text("Welcome back", color = PulseText, style = MaterialTheme.typography.headlineSmall)
            Text(
                text = "Sign in to sync your notes and unlock cross-device.",
                color = PulseTextMuted,
                style = MaterialTheme.typography.bodySmall,
            )
            Spacer(modifier = Modifier.height(20.dp))
            AuthField(
                label = "Email",
                value = state.email,
                onValueChange = vm::setEmail,
                placeholder = "anya@mail.com",
                isValid = emailValid,
                errorText = state.emailError,
                keyboardType = KeyboardType.Email,
            )
            PasswordField(
                label = "Password",
                value = state.password,
                onValueChange = vm::setPassword,
                errorText = state.passwordError,
                onImeAction = { vm.submit() },
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
            ) {
                Text(
                    text = "Forgot password?",
                    color = PulseTextMuted,
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier
                        .clickable { onForgot() }
                        .padding(vertical = 4.dp, horizontal = 4.dp),
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
            if (state.formError != null) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(PulseSurface2, RoundedCornerShape(0.dp))
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                ) {
                    Text(
                        text = state.formError!!,
                        color = PulseRed,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
            PrimaryButton(
                label = "Log in",
                onClick = { vm.submit() },
                isLoading = state.isSubmitting,
                isEnabled = emailValid && state.password.isNotEmpty(),
                loadingLabel = "Logging in…",
            )
            TrustLine(
                text = "Your password is the key. Notes are encrypted on this device before sync. We can't read them.",
            )
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(PulseBg)
                .padding(vertical = 20.dp, horizontal = 20.dp),
            contentAlignment = Alignment.Center,
        ) {
            Row {
                Text(
                    text = "No account? ",
                    color = PulseTextMuted,
                    style = MaterialTheme.typography.bodySmall,
                )
                Text(
                    text = "Create one →",
                    color = PulsePrimary,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier
                        .clickable { onCreateAccount() }
                        .padding(horizontal = 2.dp),
                )
            }
        }
    }
}

private fun Modifier.offsetX(x: androidx.compose.ui.unit.Dp): Modifier =
    this.then(Modifier.padding(start = x))
