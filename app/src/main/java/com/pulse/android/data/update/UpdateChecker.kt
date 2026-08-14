/*
 * UpdateChecker — polls a JSON manifest on app start, compares versions.
 *
 * Mirrors the desktop `data/update/UpdateChecker.kt` shape. v0.1.0 in
 * pulse-android. Reads https://ownlocalml.com/updates/android-kotlin.json.
 *
 * Manifest schema:
 *   {
 *     "version": "0.2.0",
 *     "releaseNotes": "...",
 *     "android": {
 *       "url": "https://ownlocalml.com/downloads/pulse-android-0.2.0.apk",
 *       "sha256": "...",
 *       "size": 24000000
 *     }
 *   }
 *
 * On match, we show a banner in the chat TopBar. Click opens the
 * system browser to the URL (no in-place patching — same trade-off
 * as desktop).
 */
package com.pulse.android.data.update

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import com.pulse.android.BuildConfig
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import javax.inject.Inject
import javax.inject.Singleton

data class UpdateInfo(
    val version: String,
    val url: String,
    val sha256: String,
    val sizeBytes: Long,
    val releaseNotes: String,
)

sealed class UpdateStatus {
    object Idle : UpdateStatus()
    object Checking : UpdateStatus()
    data class UpToDate(val current: String) : UpdateStatus()
    data class Available(val info: UpdateInfo) : UpdateStatus()
    data class Failed(val reason: String) : UpdateStatus()
}

@Singleton
class UpdateChecker @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    val currentVersion: String = BuildConfig.VERSION_NAME

    private val manifestUrl = "https://ownlocalml.com/updates/android-kotlin.json"

    suspend fun check(): UpdateStatus = withContext(Dispatchers.IO) {
        try {
            val text = fetch(manifestUrl)
            val manifest = parse(text) ?: return@withContext UpdateStatus.Failed("manifest: empty or invalid JSON")
            val pkg = manifest.optJSONObject("android") ?: return@withContext UpdateStatus.UpToDate(currentVersion)
            val latest = manifest.optString("version", "")
            val url = pkg.optString("url", "")
            val sha256 = pkg.optString("sha256", "")
            val size = pkg.optLong("size", 0L)
            val notes = manifest.optString("releaseNotes", "")
            if (latest.isBlank() || url.isBlank()) {
                return@withContext UpdateStatus.Failed("manifest: missing version or url for android")
            }
            if (compareVersions(latest, currentVersion) <= 0) {
                return@withContext UpdateStatus.UpToDate(currentVersion)
            }
            UpdateStatus.Available(
                UpdateInfo(
                    version = latest,
                    url = url,
                    sha256 = sha256,
                    sizeBytes = size,
                    releaseNotes = notes,
                )
            )
        } catch (t: Throwable) {
            UpdateStatus.Failed(t.message ?: t::class.java.simpleName)
        }
    }

    /** Open the URL in the system browser (or a chooser). */
    fun openDownload(url: String) {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(intent)
        } catch (_: Throwable) {
            // No browser? Silent fail — the user can copy/paste.
        }
    }

    private fun compareVersions(a: String, b: String): Int {
        val pa = a.split(".").map { it.toIntOrNull() ?: 0 }
        val pb = b.split(".").map { it.toIntOrNull() ?: 0 }
        val n = maxOf(pa.size, pb.size)
        for (i in 0 until n) {
            val x = pa.getOrElse(i) { 0 }
            val y = pb.getOrElse(i) { 0 }
            if (x != y) return if (x > y) 1 else -1
        }
        return 0
    }

    private fun fetch(url: String): String {
        val conn = URI(url).toURL().openConnection() as HttpURLConnection
        conn.connectTimeout = 8_000
        conn.readTimeout = 8_000
        conn.setRequestProperty("User-Agent", "Mozilla/5.0 Pulse/1.0 (android; +https://ownlocalml.com)")
        conn.setRequestProperty("Accept", "application/json")
        val code = conn.responseCode
        if (code !in 200..299) {
            conn.disconnect()
            throw RuntimeException("manifest HTTP $code")
        }
        val text = conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
        conn.disconnect()
        return text
    }

    private fun parse(text: String): JSONObject? = runCatching { JSONObject(text) }.getOrNull()
}
