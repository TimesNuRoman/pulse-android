/*
 * ForgotPasswordViewModel — POST /api/auth/forgot.
 *
 * Anti-enumeration: the server always returns 200, so the VM has nothing to do
 * but show a generic success state.
 */
package com.pulse.android.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pulse.android.data.api.AuthError
import com.pulse.android.data.api.AuthResult
import com.pulse.android.data.auth.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ForgotUiState(
    val email: String = "",
    val isSubmitting: Boolean = false,
    val isSent: Boolean = false,
    val emailError: String? = null,
)

@HiltViewModel
class ForgotPasswordViewModel @Inject constructor(
    private val authRepo: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(ForgotUiState())
    val state = _state.asStateFlow()

    fun setEmail(v: String) { _state.update { it.copy(email = v, emailError = null) } }

    fun submit() {
        val s = _state.value
        if (s.isSubmitting) return
        val email = s.email.trim().lowercase()
        if (!com.pulse.android.data.api.AuthApi.isValidEmail(email)) {
            _state.update { it.copy(emailError = "Enter a valid email.") }
            return
        }
        _state.update { it.copy(isSubmitting = true) }
        viewModelScope.launch {
            when (val res = authRepo.forgot(email)) {
                is AuthResult.Ok -> _state.update { it.copy(isSubmitting = false, isSent = true) }
                is AuthResult.Err -> {
                    val msg = when (val e = res.error) {
                        is AuthError.RateLimited -> "Too many resends. Try again in an hour."
                        is AuthError.Network -> "Network error. Check your connection."
                        else -> e.message ?: "Failed."
                    }
                    _state.update { it.copy(isSubmitting = false) }
                    android.util.Log.w("Forgot", "submit failed: $msg")
                    // For anti-enumeration we still show "isSent = true" so the UI
                    // never reveals whether the email is registered.
                    _state.update { it.copy(isSent = true) }
                }
            }
        }
    }
}
