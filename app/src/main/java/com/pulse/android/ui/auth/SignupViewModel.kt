/*
 * SignupViewModel — drives the /signup form.
 *
 * - Name + email + password + terms checkbox.
 * - Strength meter driven by [PasswordStrength.of].
 * - On submit → AuthRepository.signup → on success navigate to /verify.
 * - Auto-save draft to DataStore every 5s (best-effort).
 */
package com.pulse.android.ui.auth

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pulse.android.data.api.AuthError
import com.pulse.android.data.api.AuthApi
import com.pulse.android.data.api.AuthResult
import com.pulse.android.data.auth.AuthRepository
import com.pulse.android.data.prefs.SignupDraftKeys
import com.pulse.android.data.prefs.signupDraftPrefs
import com.pulse.android.ui.auth.components.PasswordStrength
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SignupUiState(
    val name: String = "",
    val email: String = "",
    val password: String = "",
    val agreedToTerms: Boolean = false,
    val nameError: String? = null,
    val emailError: String? = null,
    val passwordError: String? = null,
    val termsError: Boolean = false,
    val formError: String? = null,
    val isSubmitting: Boolean = false,
    val navigateToVerify: Boolean = false,
) {
    val canSubmit: Boolean
        get() = name.isNotBlank() && email.isNotEmpty() && AuthApi.isValidEmail(email.trim()) &&
            PasswordStrength.of(password) != PasswordStrength.Empty && agreedToTerms && !isSubmitting
}

@HiltViewModel
class SignupViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val authRepo: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(SignupUiState())
    val state = _state.asStateFlow()

    private var saveJob: Job? = null

    init {
        viewModelScope.launch {
            val prefs = context.signupDraftPrefs.data.first()
            _state.update {
                it.copy(
                    name = prefs[SignupDraftKeys.Name].orEmpty(),
                    email = prefs[SignupDraftKeys.Email].orEmpty(),
                )
            }
        }
        saveJob = viewModelScope.launch {
            while (true) {
                delay(5_000)
                val s = _state.value
                context.signupDraftPrefs.edit {
                    if (s.name.isNotBlank()) it[SignupDraftKeys.Name] = s.name else it.remove(SignupDraftKeys.Name)
                    if (s.email.isNotBlank()) it[SignupDraftKeys.Email] = s.email else it.remove(SignupDraftKeys.Email)
                }
            }
        }
    }

    fun setName(v: String) { _state.update { it.copy(name = v, nameError = null, formError = null) } }
    fun setEmail(v: String) { _state.update { it.copy(email = v, emailError = null, formError = null) } }
    fun setPassword(v: String) { _state.update { it.copy(password = v, passwordError = null, formError = null) } }
    fun setAgreed(v: Boolean) { _state.update { it.copy(agreedToTerms = v, termsError = false) } }

    fun submit() {
        val s = _state.value
        if (s.isSubmitting) return
        if (!s.agreedToTerms) {
            _state.update { it.copy(termsError = true) }
            return
        }
        val nameError = if (s.name.isBlank() || s.name.length !in 1..80) "Enter your name." else null
        val email = s.email.trim().lowercase()
        val emailError = if (!AuthApi.isValidEmail(email)) "Enter a valid email." else null
        val passwordError = when {
            s.password.length < 8 -> "Use at least 8 characters."
            s.password.length > 128 -> "Too long (max 128)."
            else -> null
        }
        if (nameError != null || emailError != null || passwordError != null) {
            _state.update { it.copy(nameError = nameError, emailError = emailError, passwordError = passwordError) }
            return
        }
        _state.update { it.copy(isSubmitting = true, formError = null) }
        viewModelScope.launch {
            when (val res = authRepo.signup(s.name.trim(), email, s.password, agreedToTerms = true)) {
                is AuthResult.Ok -> {
                    clearDraft()
                    _state.update { it.copy(isSubmitting = false, navigateToVerify = true) }
                }
                is AuthResult.Err -> {
                    val msg = when (val err = res.error) {
                        is AuthError.EmailTaken -> "This email is already registered. Log in instead."
                        is AuthError.RateLimited -> "Too many attempts. Wait a minute and try again."
                        is AuthError.Network -> "Network error. Check your connection."
                        is AuthError.Server -> "Server error ${err.code}. Try again later."
                        else -> err.message ?: "Signup failed."
                    }
                    _state.update { it.copy(isSubmitting = false, formError = msg) }
                }
            }
        }
    }

    fun consumeNavigation() { _state.update { it.copy(navigateToVerify = false) } }
    fun clearTermsError() { _state.update { it.copy(termsError = false) } }

    private suspend fun clearDraft() {
        context.signupDraftPrefs.edit { it.clear() }
    }
}
