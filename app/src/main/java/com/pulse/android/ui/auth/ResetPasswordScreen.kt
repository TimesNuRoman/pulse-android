/*
 * ResetPasswordScreen — /reset?token=... route, opened from a deep link.
 *
 * Layout mirrors /forgot + password + strength meter.
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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.pulse.android.theme.PulseBg
import com.pulse.android.theme.PulseRed
import com.pulse.android.theme.PulseSurface2
import com.pulse.android.theme.PulseText
import com.pulse.android.theme.PulseTextMuted
import com.pulse.android.ui.auth.components.PasswordField
import com.pulse.android.ui.auth.components.PrimaryButton
import com.pulse.android.ui.auth.components.StrengthMeter
import com.pulse.android.ui.components.TopBar

@Composable
fun ResetPasswordScreen(
    token: String,
    onBack: () -> Unit,
    onSuccess: () -> Unit,
    vm: ResetPasswordViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsState()
    val scroll = rememberScrollState()

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
        TopBar(title = "Reset password", onBack = onBack)
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(scroll)
                .padding(horizontal = 20.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Spacer(modifier = Modifier.height(8.dp))
            Text("Set a new password", color = PulseText, style = MaterialTheme.typography.headlineSmall)
            Text(
                text = "Pick something strong. Your other sessions will be signed out.",
                color = PulseTextMuted,
                style = MaterialTheme.typography.bodySmall,
            )
            Spacer(modifier = Modifier.height(8.dp))
            PasswordField(
                label = "New password",
                value = state.password,
                onValueChange = vm::setPassword,
                errorText = state.passwordError,
                onImeAction = { vm.submit(token) },
            )
            StrengthMeter(password = state.password)
            if (state.formError != null) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(PulseSurface2)
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                ) {
                    Text(state.formError!!, color = PulseRed, style = MaterialTheme.typography.bodySmall)
                }
            }
            PrimaryButton(
                label = "Reset password",
                onClick = { vm.submit(token) },
                isLoading = state.isSubmitting,
                isEnabled = state.password.length >= 8,
                loadingLabel = "Resetting…",
            )
        }
    }
}
