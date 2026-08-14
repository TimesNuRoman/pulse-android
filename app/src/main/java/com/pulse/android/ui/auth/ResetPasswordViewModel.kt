/*
 * ResetPasswordViewModel — POST /api/auth/reset?token=... with new password.
 *
 * On success the server returns a fresh LoginResponse (because password change
 * invalidates all other sessions), so the user is logged in automatically and
 * we navigate to /notes.
 */
package com.pulse.android.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pulse.android.data.api.AuthError
import com.pulse.android.data.api.AuthResult
import com.pulse.android.data.auth.AuthRepository
import com.pulse.android.ui.auth.components.PasswordStrength
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ResetUiState(
    val password: String = "",
    val isSubmitting: Boolean = false,
    val passwordError: String? = null,
    val formError: String? = null,
    val navigateToNotes: Boolean = false,
)

@HiltViewModel
class ResetPasswordViewModel @Inject constructor(
    private val authRepo: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(ResetUiState())
    val state = _state.asStateFlow()

    fun setPassword(v: String) { _state.update { it.copy(password = v, passwordError = null, formError = null) } }

    fun submit(token: String) {
        val s = _state.value
        if (s.isSubmitting) return
        val passwordError = when {
            s.password.length < 8 -> "Use at least 8 characters."
            s.password.length > 128 -> "Too long (max 128)."
            PasswordStrength.of(s.password) == PasswordStrength.Empty -> "Use a stronger password."
            else -> null
        }
        if (passwordError != null) {
            _state.update { it.copy(passwordError = passwordError) }
            return
        }
        _state.update { it.copy(isSubmitting = true, formError = null) }
        viewModelScope.launch {
            when (val res = authRepo.reset(token = token, newPassword = s.password)) {
                is AuthResult.Ok -> _state.update { it.copy(isSubmitting = false, navigateToNotes = true) }
                is AuthResult.Err -> {
                    val msg = when (val e = res.error) {
                        is AuthError.WrongCredentials -> "This reset link has expired. Request a new one."
                        is AuthError.RateLimited -> "Too many attempts. Try again in a few minutes."
                        is AuthError.Network -> "Network error. Check your connection."
                        else -> e.message ?: "Reset failed."
                    }
                    _state.update { it.copy(isSubmitting = false, formError = msg) }
                }
            }
        }
    }

    fun consumeNavigation() { _state.update { it.copy(navigateToNotes = false) } }
}
