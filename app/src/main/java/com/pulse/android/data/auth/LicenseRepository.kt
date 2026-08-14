/*
 * LicenseRepository — single source of truth for the user's tier.
 *
 * Strategy:
 *   - On every fetch, hit `/api/auth/license` with the current session token.
 *   - On 200 → use the server response (authoritative).
 *   - On network failure → fall back to a local cached value (DataStore) and
 *     surface as "offline" so the UI can show a chip "offline".
 *   - On 401 → user is not authed; UI should show "Sign in".
 *
 * The state is exposed as a hot [StateFlow] so any composable can observe
 * `state.value.tier == "pro"` without polling.
 */
package com.pulse.android.data.auth

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.pulse.android.data.api.AuthApi
import com.pulse.android.data.api.AuthError
import com.pulse.android.data.api.AuthResult
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

private val Context.licenseCacheStore by preferencesDataStore("pulse_license_cache")
private val KEY_TIER = stringPreferencesKey("tier")
private val KEY_EXPIRES = stringPreferencesKey("expires_at")
private val KEY_CACHED = stringPreferencesKey("cached_json")

data class LicenseState(
    val tier: String = "free",        // "free" | "pro" | "expired" | "unauth"
    val expiresAt: Long = 0L,
    val source: Source = Source.Unknown,
    val isLoading: Boolean = false,
) {
    val isPro: Boolean get() = tier == "pro" && expiresAt == 0L || (tier == "pro" && expiresAt > System.currentTimeMillis())
    val isProExpired: Boolean get() = tier == "pro" && expiresAt in 1..System.currentTimeMillis()
    enum class Source { Unknown, Online, Offline, Unauth }
}

@Singleton
class LicenseRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val authRepo: AuthRepository,
    private val authApi: AuthApi,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _state = MutableStateFlow(LicenseState())
    val state: StateFlow<LicenseState> = _state.asStateFlow()

    init {
        scope.launch {
            val cached = readCache()
            if (cached != null) _state.value = cached.copy(source = LicenseState.Source.Offline)
        }
        scope.launch { refresh() }
    }

    /**
     * Force a refresh. Returns the new state. Safe to call from any dispatcher.
     */
    suspend fun refresh(): LicenseState {
        _state.update { it.copy(isLoading = true) }
        val token = authRepo.sessionState.value?.sessionToken
        if (token == null) {
            _state.value = LicenseState(tier = "unauth", source = LicenseState.Source.Unauth)
            return _state.value
        }
        // Reuse AuthApi's OkHttp — for v1 we issue a manual request rather than
        // expand AuthApi's surface. The endpoint contract is `/api/auth/license`.
        val res = fetchLicense(token)
        val newState = when (res) {
            is AuthResult.Ok -> res.value
            is AuthResult.Err -> when (val e = res.error) {
                is AuthError.WrongCredentials -> LicenseState(tier = "unauth", source = LicenseState.Source.Unauth)
                else -> readCache() ?: LicenseState(tier = "free", source = LicenseState.Source.Offline)
            }
        }
        _state.value = newState
        if (newState.source == LicenseState.Source.Online) writeCache(newState)
        return newState
    }

    /**
     * Re-read the cached license from DataStore. Returns null if never cached.
     */
    suspend fun readCache(): LicenseState? {
        val prefs = context.licenseCacheStore.data.first()
        val json = prefs[KEY_CACHED] ?: return null
        return try {
            val o = JSONObject(json)
            LicenseState(
                tier = o.optString("tier", "free"),
                expiresAt = o.optLong("expires_at", 0),
                source = LicenseState.Source.Offline,
            )
        } catch (_: Exception) { null }
    }

    private suspend fun writeCache(s: LicenseState) {
        context.licenseCacheStore.edit { prefs ->
            val o = JSONObject().apply {
                put("tier", s.tier)
                put("expires_at", s.expiresAt)
            }
            prefs[KEY_CACHED] = o.toString()
            prefs[KEY_TIER] = s.tier
            prefs[KEY_EXPIRES] = s.expiresAt.toString()
        }
    }

    /**
     * Manual /api/auth/license fetch. We don't lean on AuthApi.signup-style methods
     * for license because the shape differs and a separate code path keeps the
     * auth surface stable.
     */
    private suspend fun fetchLicense(token: String): AuthResult<LicenseState> {
        return try {
            val client = okhttp3.OkHttpClient.Builder()
                .connectTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
                .readTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
                .build()
            val req = okhttp3.Request.Builder()
                .url("https://api.ownlocalml.com/api/auth/license")
                .get()
                .header("Authorization", "Bearer $token")
                .build()
            client.newCall(req).execute().use { resp ->
                when (resp.code) {
                    in 200..299 -> {
                        val text = resp.body?.string().orEmpty()
                        val obj = JSONObject(text)
                        val tier = obj.optString("tier", "free")
                        val expiresAt = obj.optLong("expires_at", 0)
                        AuthResult.Ok(
                            LicenseState(
                                tier = tier,
                                expiresAt = expiresAt,
                                source = LicenseState.Source.Online,
                            ),
                        )
                    }
                    401 -> AuthResult.Err(AuthError.WrongCredentials)
                    else -> AuthResult.Err(AuthError.Server(resp.code, null))
                }
            }
        } catch (e: java.io.IOException) {
            AuthResult.Err(AuthError.Network)
        } catch (e: Exception) {
            AuthResult.Err(AuthError.Unknown(e.message))
        }
    }
}
