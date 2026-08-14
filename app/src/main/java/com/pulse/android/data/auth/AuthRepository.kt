/*
 * AuthRepository — the only entry point for the auth flow.
 *
 *   - Owns the [SessionStore] (EncryptedSharedPreferences).
 *   - Wraps [AuthApi] calls into coroutine-friendly [AuthResult]s.
 *   - Derives the encryption key on the IO dispatcher after a successful login.
 *   - Tracks the active session in-memory via [sessionState].
 *
 * The "auto-logout after 5 min background" rule from the spec is the caller's
 * responsibility (see AuthNavGraph / MainActivity) — we just expose [sessionState]
 * and [hasSession] for them to observe.
 */
package com.pulse.android.data.auth

import android.content.Context
import com.pulse.android.data.api.AuthApi
import com.pulse.android.data.api.AuthError
import com.pulse.android.data.api.AuthResult
import com.pulse.android.data.api.LoginResponse
import com.pulse.android.data.auth.models.Session
import com.pulse.android.data.auth.models.User
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val api: AuthApi,
) {
    private val store = SessionStore(context)

    private val _sessionState = MutableStateFlow(store.load())
    val sessionState: StateFlow<Session?> = _sessionState.asStateFlow()

    val hasSession: Boolean get() = _sessionState.value != null

    suspend fun signup(name: String, email: String, password: String, agreedToTerms: Boolean): AuthResult<User> {
        return api.signup(name = name, email = email, password = password, agreedToTerms = agreedToTerms)
    }

    suspend fun login(email: String, password: String): AuthResult<LoginResponse> {
        return when (val res = api.login(email = email, password = password)) {
            is AuthResult.Ok -> {
                persistSession(res.value)
                AuthResult.Ok(res.value)
            }
            is AuthResult.Err -> res
        }
    }

    suspend fun logout(keepLocalData: Boolean = true): AuthResult<Unit> {
        val token = _sessionState.value?.sessionToken
        if (token != null) {
            // Best-effort server-side logout; even if it fails, we wipe locally.
            api.logout(token)
        }
        _sessionState.value = null
        store.clear()
        if (!keepLocalData) {
            // Caller is responsible for the local-DB wipe (it needs the DB context).
        }
        return AuthResult.Ok(Unit)
    }

    suspend fun resendVerification(email: String): AuthResult<Unit> = api.resendVerification(email)

    suspend fun verifyToken(token: String): AuthResult<User> = api.verify(token)

    suspend fun checkVerified(): AuthResult<Boolean> = api.checkVerified()

    suspend fun forgot(email: String): AuthResult<Unit> = api.forgot(email)

    suspend fun reset(token: String, newPassword: String): AuthResult<LoginResponse> {
        return when (val res = api.reset(token = token, newPassword = newPassword)) {
            is AuthResult.Ok -> {
                persistSession(res.value)
                AuthResult.Ok(res.value)
            }
            is AuthResult.Err -> res
        }
    }

    suspend fun me(): AuthResult<User> {
        val token = _sessionState.value?.sessionToken ?: return AuthResult.Err(AuthError.WrongCredentials)
        return when (val res = api.me(token)) {
            is AuthResult.Err -> {
                // Server says our token is bad — purge.
                if (res.error is AuthError.WrongCredentials) {
                    _sessionState.value = null
                    store.clear()
                }
                res
            }
            is AuthResult.Ok -> res
        }
    }

    private fun persistSession(login: LoginResponse) {
        store.save(login.session)
        _sessionState.value = login.session
    }
}
