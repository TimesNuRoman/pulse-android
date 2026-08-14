/*
 * VerifyEmailViewModel — drives the /verify screen.
 *
 * - Polls /api/auth/check-verified every 5s; navigates forward on success.
 * - "Resend" link → POST /api/auth/resend-verification.
 * - "Open email app" deep-links to gmail/outlook/yahoo/icloud or `mailto:`.
 * - Stops polling after 5 min, prompts user to tap resend.
 */
package com.pulse.android.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pulse.android.data.api.AuthError
import com.pulse.android.data.api.AuthResult
import com.pulse.android.data.auth.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class VerifyUiState(
    val email: String = "",
    val isResending: Boolean = false,
    val resendSent: Boolean = false,
    val isPolling: Boolean = true,
    val isTimedOut: Boolean = false,
    val navigateToNotes: Boolean = false,
)

@HiltViewModel
class VerifyEmailViewModel @Inject constructor(
    private val authRepo: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(VerifyUiState())
    val state = _state.asStateFlow()

    private var pollJob: Job? = null

    fun start(email: String) {
        if (_state.value.email.isNotEmpty() && _state.value.email == email) return
        _state.update { it.copy(email = email) }
        startPolling()
    }

    fun resend() {
        if (_state.value.isResending) return
        val email = _state.value.email
        if (email.isBlank()) return
        _state.update { it.copy(isResending = true, resendSent = false) }
        viewModelScope.launch {
            when (val res = authRepo.resendVerification(email)) {
                is AuthResult.Ok -> {
                    _state.update { it.copy(isResending = false, resendSent = true, isTimedOut = false) }
                    viewModelScope.launch {
                        delay(4_000)
                        _state.update { it.copy(resendSent = false) }
                    }
                }
                is AuthResult.Err -> {
                    val msg = when (val e = res.error) {
                        is AuthError.RateLimited -> "Too many resends. Try again in a few hours."
                        is AuthError.Network -> "Network error. Check your connection."
                        else -> e.message ?: "Resend failed."
                    }
                    _state.update { it.copy(isResending = false) }
                    // surface via a one-shot — for v1 we just log; UI can read error from
                    // a dedicated field added later. Keeping scope tight.
                    android.util.Log.w("VerifyEmail", "resend failed: $msg")
                }
            }
        }
    }

    fun stop() {
        pollJob?.cancel()
    }

    private fun startPolling() {
        pollJob?.cancel()
        pollJob = viewModelScope.launch {
            val deadline = System.currentTimeMillis() + 5 * 60 * 1000L
            while (_state.value.isPolling && System.currentTimeMillis() < deadline) {
                delay(5_000)
                when (val r = authRepo.checkVerified()) {
                    is AuthResult.Ok -> if (r.value) {
                        _state.update { it.copy(navigateToNotes = true, isPolling = false) }
                        return@launch
                    }
                    else -> { /* keep polling */ }
                }
            }
            _state.update { it.copy(isPolling = false, isTimedOut = true) }
        }
    }

    fun consumeNavigation() { _state.update { it.copy(navigateToNotes = false) } }

    /**
     * Build a deep-link URL for the given email's host.
     */
    fun emailAppUrl(): String {
        val email = _state.value.email
        val host = email.substringAfter("@", missingDelimiterValue = "").lowercase()
        return when {
            host.endsWith("gmail.com") || host.endsWith("googlemail.com") -> "https://mail.google.com"
            host.endsWith("outlook.com") || host.endsWith("hotmail.com") || host.endsWith("live.com") ->
                "https://outlook.live.com/mail"
            host.endsWith("yahoo.com") -> "https://mail.yahoo.com"
            host.endsWith("icloud.com") || host.endsWith("me.com") -> "https://www.icloud.com/mail"
            else -> "mailto:$email"
        }
    }
}
