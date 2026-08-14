/*
 * ForgotPasswordScreen — /forgot route.
 *
 * Layout per spec:
 *   - Top bar: back, "Reset password" title
 *   - "← Back to log in" link (top, 12px muted)
 *   - "Forgot your password?" headline + 13px muted sub
 *   - Email field (with green check on valid)
 *   - Primary "Send reset link" button
 *   - Trust line: "If your email matches an account, a reset link is on its way…"
 *   - Footer: "No account? Create one →"
 *
 * Anti-enumeration: success state is shown for any valid email, regardless of
 * whether the account exists.
 */
package com.pulse.android.ui.auth

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.pulse.android.data.api.AuthApi
import com.pulse.android.theme.PulseBg
import com.pulse.android.theme.PulsePrimary
import com.pulse.android.theme.PulseText
import com.pulse.android.theme.PulseTextMuted
import com.pulse.android.ui.auth.components.AuthField
import com.pulse.android.ui.auth.components.KeyboardType
import com.pulse.android.ui.auth.components.PrimaryButton
import com.pulse.android.ui.auth.components.TrustLine
import com.pulse.android.ui.components.TopBar

@Composable
fun ForgotPasswordScreen(
    onBack: () -> Unit,
    onCreateAccount: () -> Unit,
    vm: ForgotPasswordViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsState()
    val scroll = rememberScrollState()
    val emailValid = state.email.isNotEmpty() && AuthApi.isValidEmail(state.email.trim())

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(PulseBg)
            .imePadding(),
    ) {
        TopBar(title = "Reset password", onBack = onBack)
        if (state.isSent) {
            SentState(email = state.email)
        } else {
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .verticalScroll(scroll)
                    .padding(horizontal = 20.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = "← Back to log in",
                    color = PulseTextMuted,
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.clickable { onBack() }.padding(vertical = 4.dp),
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text("Forgot your password?", color = PulseText, style = MaterialTheme.typography.headlineSmall)
                Text(
                    text = "Enter the email on your account. We'll send a reset link.",
                    color = PulseTextMuted,
                    style = MaterialTheme.typography.bodySmall,
                )
                Spacer(modifier = Modifier.height(8.dp))
                AuthField(
                    label = "Email",
                    value = state.email,
                    onValueChange = vm::setEmail,
                    placeholder = "anya@mail.com",
                    isValid = emailValid,
                    errorText = state.emailError,
                    keyboardType = KeyboardType.Email,
                    onImeAction = { vm.submit() },
                )
                PrimaryButton(
                    label = "Send reset link",
                    onClick = { vm.submit() },
                    isLoading = state.isSubmitting,
                    isEnabled = emailValid,
                    loadingLabel = "Sending…",
                )
                TrustLine(
                    text = "If your email matches an account, a reset link is on its way. We don't reveal whether the email is registered.",
                )
            }
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
                    modifier = Modifier.clickable { onCreateAccount() }.padding(horizontal = 2.dp),
                )
            }
        }
    }
}

@Composable
private fun SentState(email: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp, vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = "If an account exists for $email, a reset link is on its way.",
            color = PulseText,
            style = MaterialTheme.typography.bodyLarge,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Check your inbox. The link expires in 1 hour.",
            color = PulseTextMuted,
            style = MaterialTheme.typography.bodySmall,
        )
    }
}
