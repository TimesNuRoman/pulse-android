/*
 * LoginViewModel — drives the /login form.
 *
 * - Email + password fields, validated client-side.
 * - On submit → AuthRepository.login → on success navigate forward.
 * - Errors map to inline alert text per the spec.
 * - Form values preserved on error (no clear).
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

data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val emailError: String? = null,
    val passwordError: String? = null,
    val formError: String? = null,
    val isSubmitting: Boolean = false,
    val navigateToNotes: Boolean = false,
)

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepo: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(LoginUiState())
    val state = _state.asStateFlow()

    fun setEmail(v: String) {
        _state.update { it.copy(email = v, emailError = null, formError = null) }
    }

    fun setPassword(v: String) {
        _state.update { it.copy(password = v, passwordError = null, formError = null) }
    }

    fun submit() {
        val s = _state.value
        if (s.isSubmitting) return
        val email = s.email.trim().lowercase()
        val emailError = if (!com.pulse.android.data.api.AuthApi.isValidEmail(email)) "Enter a valid email." else null
        val passwordError = if (s.password.isEmpty()) "Enter your password." else null
        if (emailError != null || passwordError != null) {
            _state.update { it.copy(emailError = emailError, passwordError = passwordError) }
            return
        }
        _state.update { it.copy(isSubmitting = true, formError = null) }
        viewModelScope.launch {
            when (val res = authRepo.login(email, s.password)) {
                is AuthResult.Ok -> {
                    if (res.value.requiresVerification) {
                        // Edge case: legacy unverified accounts logging back in.
                        _state.update { it.copy(isSubmitting = false, navigateToNotes = false, formError = "Verify your email first.") }
                    } else {
                        _state.update { it.copy(isSubmitting = false, navigateToNotes = true) }
                    }
                }
                is AuthResult.Err -> {
                    val msg = when (val err = res.error) {
                        is AuthError.WrongCredentials -> "Email or password is incorrect. Try again."
                        is AuthError.RateLimited -> "Too many attempts. Wait a minute and try again."
                        is AuthError.Network -> "Network error. Check your connection."
                        is AuthError.Server -> "Server error ${err.code}. Try again later."
                        else -> err.message ?: "Login failed."
                    }
                    _state.update { it.copy(isSubmitting = false, formError = msg) }
                }
            }
        }
    }

    fun consumeNavigation() { _state.update { it.copy(navigateToNotes = false) } }
}
