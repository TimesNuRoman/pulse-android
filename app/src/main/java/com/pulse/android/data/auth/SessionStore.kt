/*
 * SessionStore — EncryptedSharedPreferences wrapper for the active session.
 *
 * Why EncryptedSharedPreferences and not DataStore:
 *   - We need AES-256 encryption tied to the Android Keystore (so even root on the
 *     device can't read it without unlocking the keystore).
 *   - The store is small (one record), so the SharedPreferences key/value model is
 *     a perfect fit — we don't need the streaming/atomicity of DataStore.
 *
 * Public surface: just `save(session)`, `load(): Session?`, `clear()`. Nothing
 * else needs to know the on-disk schema.
 */
package com.pulse.android.data.auth

import android.content.Context
import android.content.SharedPreferences
import android.util.Base64
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.pulse.android.data.auth.models.Session
import java.security.SecureRandom

class SessionStore(context: Context) {

    private val prefs: SharedPreferences = run {
        val masterKey = MasterKey.Builder(context.applicationContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context.applicationContext,
            "pulse_session",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    fun load(): Session? {
        val token = prefs.getString(KEY_TOKEN, null) ?: return null
        val userId = prefs.getString(KEY_USER_ID, null) ?: return null
        val email = prefs.getString(KEY_EMAIL, null) ?: return null
        val keyB64 = prefs.getString(KEY_ENC_KEY, null) ?: return null
        val keyVersion = prefs.getInt(KEY_KEY_VERSION, 1)
        val lastLoginAt = prefs.getLong(KEY_LAST_LOGIN, 0L)
        val key = Base64.decode(keyB64, Base64.NO_WRAP)
        return Session(
            sessionToken = token,
            userId = userId,
            email = email,
            encryptionKey = key,
            encryptionKeyVersion = keyVersion,
            lastLoginAt = lastLoginAt,
        )
    }

    fun save(session: Session) {
        prefs.edit()
            .putString(KEY_TOKEN, session.sessionToken)
            .putString(KEY_USER_ID, session.userId)
            .putString(KEY_EMAIL, session.email)
            .putString(KEY_ENC_KEY, Base64.encodeToString(session.encryptionKey, Base64.NO_WRAP))
            .putInt(KEY_KEY_VERSION, session.encryptionKeyVersion)
            .putLong(KEY_LAST_LOGIN, session.lastLoginAt)
            .apply()
    }

    fun clear() {
        prefs.edit().clear().apply()
    }

    /**
     * Wipe the encryption key (used by "Sign out" — we keep the session_token
     * around for a few seconds so the in-flight API call doesn't 401, then
     * [purgeToken] does the full clear).
     */
    fun clearEncryptionKey() {
        prefs.edit().remove(KEY_ENC_KEY).apply()
    }

    fun purgeToken() {
        prefs.edit().remove(KEY_TOKEN).apply()
    }

    companion object {
        private const val KEY_TOKEN = "session_token"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_EMAIL = "email"
        private const val KEY_ENC_KEY = "encryption_key"
        private const val KEY_KEY_VERSION = "encryption_key_version"
        private const val KEY_LAST_LOGIN = "last_login_at"

        /** Generate a fresh 32-byte key for new sessions. */
        fun randomKey(): ByteArray = ByteArray(32).also { SecureRandom().nextBytes(it) }
    }
}
