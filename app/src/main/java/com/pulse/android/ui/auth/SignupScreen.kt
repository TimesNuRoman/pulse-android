/*
 * SignupScreen — /signup route.
 *
 * Layout per spec:
 *   - Top bar: back, "Create account" title
 *   - "Create your account" headline + 13px muted sub ("Free forever — 100/50", "100" and "50" bolded)
 *   - Name field, Email field, Password field (with show/hide), Strength meter
 *   - Terms checkbox (animated shake on unaccepted submit)
 *   - Primary "Create account" button (disabled until all valid + terms)
 *   - Footer: "Already have an account? Log in →"
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
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.pulse.android.data.api.AuthApi
import com.pulse.android.theme.PulseBg
import com.pulse.android.theme.PulsePrimary
import com.pulse.android.theme.PulseRed
import com.pulse.android.theme.PulseSurface2
import com.pulse.android.theme.PulseText
import com.pulse.android.theme.PulseTextMuted
import com.pulse.android.ui.auth.components.AuthField
import com.pulse.android.ui.auth.components.KeyboardType
import com.pulse.android.ui.auth.components.PasswordField
import com.pulse.android.ui.auth.components.PrimaryButton
import com.pulse.android.ui.auth.components.StrengthMeter
import com.pulse.android.ui.components.Icons
import com.pulse.android.ui.components.TopBar
import kotlinx.coroutines.delay

@Composable
fun SignupScreen(
    onBack: () -> Unit,
    onSuccess: (email: String) -> Unit,
    onLogin: () -> Unit,
    vm: SignupViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsState()
    val scroll = rememberScrollState()
    val emailValid = state.email.isNotEmpty() && AuthApi.isValidEmail(state.email.trim())

    var termsShake by remember { mutableStateOf(0) }
    val termsOffset by animateDpAsState(
        targetValue = if (termsShake != 0) if (termsShake % 2 == 0) 4.dp else (-4).dp else 0.dp,
        animationSpec = tween(80),
        label = "terms-shake",
    )
    LaunchedEffect(state.termsError) {
        if (state.termsError) {
            repeat(4) {
                termsShake++
                delay(80)
            }
            vm.clearTermsError()
        }
    }

    LaunchedEffect(state.navigateToVerify) {
        if (state.navigateToVerify) {
            onSuccess(state.email.trim().lowercase())
            vm.consumeNavigation()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(PulseBg)
            .imePadding(),
    ) {
        TopBar(title = "Create account", onBack = onBack)
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(scroll)
                .padding(horizontal = 20.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Spacer(modifier = Modifier.height(4.dp))
            Text("Create your account", color = PulseText, style = MaterialTheme.typography.headlineSmall)
            Text(
                text = buildAnnotatedString {
                    append("Free forever — ")
                    withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append("100") }
                    append(" messages a day, ")
                    withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append("50") }
                    append(" notes.\nNo card required.")
                },
                color = PulseTextMuted,
                style = MaterialTheme.typography.bodySmall,
            )
            Spacer(modifier = Modifier.height(8.dp))
            AuthField(
                label = "Name",
                value = state.name,
                onValueChange = vm::setName,
                placeholder = "Anya Petrova",
                isValid = state.name.isNotBlank(),
                errorText = state.nameError,
            )
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
            )
            StrengthMeter(password = state.password)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { vm.setAgreed(!state.agreedToTerms) }
                    .padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(14.dp)
                        .background(
                            if (state.agreedToTerms) PulsePrimary else PulseSurface2,
                            RoundedCornerShape(0.dp),
                        ),
                )
                Text(
                    text = "I'm OK with the Terms and Privacy. No telemetry, ever.",
                    color = if (state.termsError) PulseRed else PulseTextMuted,
                    style = MaterialTheme.typography.labelSmall,
                )
            }
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
                label = "Create account",
                onClick = { vm.submit() },
                isLoading = state.isSubmitting,
                isEnabled = state.canSubmit,
                loadingLabel = "Creating account…",
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
                    text = "Already have an account? ",
                    color = PulseTextMuted,
                    style = MaterialTheme.typography.bodySmall,
                )
                Text(
                    text = "Log in →",
                    color = PulsePrimary,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier
                        .clickable { onLogin() }
                        .padding(horizontal = 2.dp),
                )
            }
        }
    }
}
