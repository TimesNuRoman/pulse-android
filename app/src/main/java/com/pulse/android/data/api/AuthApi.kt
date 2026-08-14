/*
 * AuthApi — typed wrapper around the 8 auth endpoints.
 *
 * Endpoints (all under https://api.ownlocalml.com):
 *   POST /api/auth/signup
 *   POST /api/auth/login
 *   POST /api/auth/logout
 *   POST /api/auth/resend-verification
 *   GET  /api/auth/verify?token=...
 *   POST /api/auth/forgot
 *   POST /api/auth/reset
 *   GET  /api/auth/check-verified
 *   GET  /api/auth/me
 *
 * Errors are normalised to [AuthError] so the UI can render friendly text
 * without parsing JSON twice.
 */
package com.pulse.android.data.api

import com.pulse.android.data.auth.SessionStore
import com.pulse.android.data.auth.models.Session
import com.pulse.android.data.auth.models.User
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

sealed class AuthError(message: String) : Throwable(message) {
    object InvalidEmail : AuthError("Enter a valid email.")
    object EmailTaken : AuthError("This email is already registered.")
    object WrongCredentials : AuthError("Email or password is incorrect.")
    object RateLimited : AuthError("Too many attempts. Wait and try again.")
    object Network : AuthError("Network error. Check your connection.")
    data class Server(val code: Int, val detail: String?) : AuthError("Server error $code")
    data class Unknown(val detail: String?) : AuthError(detail ?: "Unknown error")
}

sealed class AuthResult<out T> {
    data class Ok<T>(val value: T) : AuthResult<T>()
    data class Err(val error: AuthError) : AuthResult<Nothing>()
}

data class LoginResponse(
    val session: Session,
    val user: User,
    val requiresVerification: Boolean = false,
)

class AuthApi(
    private val baseUrl: String = "https://api.ownlocalml.com",
    private val client: OkHttpClient = defaultClient(),
) {

    suspend fun signup(
        name: String,
        email: String,
        password: String,
        agreedToTerms: Boolean,
    ): AuthResult<User> = post<User>(
        path = "/api/auth/signup",
        body = JSONObject().apply {
            put("name", name)
            put("email", email)
            put("password", password)
            put("agreedToTerms", agreedToTerms)
            put("company", "")
            put("device_type", "android")
        },
        authenticated = false,
    )

    suspend fun login(email: String, password: String): AuthResult<LoginResponse> = post<LoginResponse>(
        path = "/api/auth/login",
        body = JSONObject().apply {
            put("email", email)
            put("password", password)
            put("device_type", "android")
        },
        authenticated = false,
        asLogin = true,
    )

    suspend fun logout(token: String): AuthResult<Unit> = post<Unit>(
        path = "/api/auth/logout",
        body = JSONObject(),
        authenticated = true,
        token = token,
    )

    suspend fun resendVerification(email: String): AuthResult<Unit> = post<Unit>(
        path = "/api/auth/resend-verification",
        body = JSONObject().put("email", email),
        authenticated = false,
    )

    suspend fun verify(token: String): AuthResult<User> = get<User>("/api/auth/verify?token=$token", asUser = true)

    suspend fun forgot(email: String): AuthResult<Unit> = post<Unit>(
        path = "/api/auth/forgot",
        body = JSONObject().put("email", email),
        authenticated = false,
    )

    suspend fun reset(token: String, newPassword: String): AuthResult<LoginResponse> = post<LoginResponse>(
        path = "/api/auth/reset",
        body = JSONObject().apply {
            put("token", token)
            put("password", newPassword)
        },
        authenticated = false,
        asLogin = true,
    )

    suspend fun checkVerified(): AuthResult<Boolean> = get<Boolean>("/api/auth/check-verified", asBool = true)

    suspend fun me(token: String): AuthResult<User> = get<User>("/api/auth/me", token = token, asUser = true)

    // ----- HTTP plumbing -----

    @Suppress("UNCHECKED_CAST")
    private suspend fun <T> post(
        path: String,
        body: JSONObject,
        authenticated: Boolean,
        token: String? = null,
        asLogin: Boolean = false,
    ): AuthResult<T> = withContext(Dispatchers.IO) {
        val req = Request.Builder()
            .url(baseUrl + path)
            .post(body.toString().toRequestBody(JSON))
            .apply { if (authenticated || token != null) header("Authorization", "Bearer $token") }
            .build()
        execute<T>(req, asLogin = asLogin)
    }

    @Suppress("UNCHECKED_CAST")
    private suspend fun <T> get(
        path: String,
        token: String? = null,
        asUser: Boolean = false,
        asBool: Boolean = false,
        asLogin: Boolean = false,
    ): AuthResult<T> = withContext(Dispatchers.IO) {
        val req = Request.Builder()
            .url(baseUrl + path)
            .get()
            .apply { if (token != null) header("Authorization", "Bearer $token") }
            .build()
        execute<T>(req, asUser = asUser, asBool = asBool, asLogin = asLogin)
    }

    @Suppress("UNCHECKED_CAST")
    private fun <T> execute(
        req: Request,
        asUser: Boolean = false,
        asBool: Boolean = false,
        asLogin: Boolean = false,
    ): AuthResult<T> {
        val raw: AuthResult<Any> = try {
            client.newCall(req).execute().use { resp ->
                val text = resp.body?.string().orEmpty()
                when (resp.code) {
                    in 200..299 -> when {
                        asBool -> AuthResult.Ok(JSONObject(text).optBoolean("verified", false)) as AuthResult<Any>
                        asUser -> AuthResult.Ok(parseUser(JSONObject(text))) as AuthResult<Any>
                        asLogin -> AuthResult.Ok(parseLoginResponse(JSONObject(text))) as AuthResult<Any>
                        else -> AuthResult.Ok(Unit) as AuthResult<Any>
                    }
                    400 -> AuthResult.Err(AuthError.Unknown(parseError(text)))
                    401 -> AuthResult.Err(AuthError.WrongCredentials)
                    409 -> AuthResult.Err(AuthError.EmailTaken)
                    429 -> AuthResult.Err(AuthError.RateLimited)
                    in 500..599 -> AuthResult.Err(AuthError.Server(resp.code, parseError(text)))
                    else -> AuthResult.Err(AuthError.Unknown(parseError(text)))
                }
            }
        } catch (e: java.io.IOException) {
            AuthResult.Err(AuthError.Network)
        } catch (e: Exception) {
            AuthResult.Err(AuthError.Unknown(e.message))
        }
        return raw as AuthResult<T>
    }

    private fun parseError(text: String): String? = try {
        JSONObject(text).optString("error").takeIf { it.isNotBlank() }
            ?: JSONObject(text).optString("message").takeIf { it.isNotBlank() }
    } catch (_: Exception) { text.take(200) }

    private fun parseUser(json: JSONObject): User = User(
        id = json.optString("id"),
        email = json.optString("email"),
        name = json.optString("name"),
        emailVerified = json.optBoolean("email_verified", false),
        tier = json.optString("tier", "free"),
        createdAt = json.optLong("created_at", 0L),
    )

    private fun parseLoginResponse(json: JSONObject): LoginResponse {
        val user = parseUser(json.getJSONObject("user"))
        val token = json.optString("session_token")
        val keyB64 = json.optString("encryption_key_b64")
        val keyBytes = if (keyB64.isNotEmpty()) {
            android.util.Base64.decode(keyB64, android.util.Base64.NO_WRAP)
        } else {
            SessionStore.randomKey()
        }
        val session = Session(
            sessionToken = token,
            userId = user.id,
            email = user.email,
            encryptionKey = keyBytes,
            encryptionKeyVersion = json.optInt("encryption_key_version", 1),
            lastLoginAt = System.currentTimeMillis(),
        )
        return LoginResponse(
            session = session,
            user = user,
            requiresVerification = json.optBoolean("requires_verification", !user.emailVerified),
        )
    }

    companion object {
        private val JSON = "application/json; charset=utf-8".toMediaType()

        fun defaultClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .build()

        // Public so the spec's regex lives next to the validator.
        val EMAIL_REGEX = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$")
        fun isValidEmail(s: String): Boolean = EMAIL_REGEX.matches(s.trim())
    }
}
