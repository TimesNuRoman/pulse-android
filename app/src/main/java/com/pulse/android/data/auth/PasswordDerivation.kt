/*
 * PasswordDerivation — scrypt wrapper for turning a user-entered password into a
 * 32-byte AES-256 key. Runs on a background dispatcher.
 *
 * Android Keystore does not expose scrypt, so we pull in BouncyCastle. Cost params
 * match the spec: N=2^15, r=8, p=1, output=32 bytes.
 *
 * Salt convention: the first 8 bytes are the user id (UUID-like), padded with the
 * device's `ANDROID_ID` to make cross-device salt reuse difficult. If the user id
 * is not yet known (signup), the salt is `ANDROID_ID` repeated to 16 bytes.
 */
package com.pulse.android.data.auth

import android.provider.Settings
import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.bouncycastle.crypto.generators.SCrypt
import java.security.SecureRandom

object PasswordDerivation {

    private const val N = 1 shl 15       // 32768
    private const val R = 8
    private const val P = 1
    private const val KEY_LEN = 32

    /**
     * Derive a 32-byte key from [password] for the given [userId]. Returns the key
     * and the base64-encoded salt (so we can persist and re-derive on password
     * rotation if needed).
     */
    suspend fun derive(
        context: Context,
        password: CharArray,
        userId: String,
    ): DeriveResult = withContext(Dispatchers.Default) {
        val salt = makeSalt(context, userId)
        val key = scrypt(password, salt, N, R, P, KEY_LEN)
        DeriveResult(key = key, salt = salt, version = 1)
    }

    /**
     * Re-derive a key given an existing salt (used after a password reset where the
     * server hands back the salt it stored at signup).
     */
    suspend fun rederive(
        password: CharArray,
        salt: ByteArray,
    ): ByteArray = withContext(Dispatchers.Default) {
        scrypt(password, salt, N, R, P, KEY_LEN)
    }

    private fun makeSalt(context: Context, userId: String): ByteArray {
        val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
            ?: "pulse-default-salt"
        val uid = userId.toByteArray(Charsets.UTF_8)
        val out = ByteArray(16)
        // First 8 bytes = first 8 of userId, then pad to 16 with ANDROID_ID bytes.
        val copyLen = minOf(8, uid.size)
        System.arraycopy(uid, 0, out, 0, copyLen)
        val aid = androidId.toByteArray(Charsets.UTF_8)
        for (i in copyLen until 16) {
            out[i] = aid[(i - copyLen) % aid.size]
        }
        return out
    }

    /**
     * BouncyCastle's `SCrypt` (org.bouncycastle.crypto.generators.SCrypt) is the raw
     * scrypt KDF we want. We zero the intermediate password bytes on the way out.
     */
    private fun scrypt(
        password: CharArray,
        salt: ByteArray,
        n: Int,
        r: Int,
        p: Int,
        keyLen: Int,
    ): ByteArray {
        val pwBytes = String(password).toByteArray(Charsets.UTF_8)
        try {
            return SCrypt.generate(pwBytes, salt, n, r, p, keyLen)
        } finally {
            pwBytes.fill(0)
        }
    }

    /**
     * Generate a fresh random salt for new accounts (signup). 16 bytes is enough;
     * we deliberately do NOT include the user id yet (we don't have one).
     */
    fun randomSalt(): ByteArray = ByteArray(16).also { SecureRandom().nextBytes(it) }

    data class DeriveResult(
        val key: ByteArray,
        val salt: ByteArray,
        val version: Int,
    ) {
        override fun equals(other: Any?): Boolean {
            if (this === other) return true
            if (other !is DeriveResult) return false
            return key.contentEquals(other.key) && salt.contentEquals(other.salt) && version == other.version
        }
        override fun hashCode(): Int = key.contentHashCode() * 31 + salt.contentHashCode() + version
    }
}
