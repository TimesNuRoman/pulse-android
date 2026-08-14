/*
 * AiApi — server-side AI client (Cloudflare Worker backend).
 *
 * Endpoints (per R264 spec, not yet implemented on the server):
 *   POST /api/ai/chat   — SSE stream of assistant tokens
 *   GET  /api/ai/models — list of available models for this user
 *   GET  /api/ai/usage  — { neuronsUsed, requests, limit, resetAt }
 *
 * Auth: cookies (session) are sent via the AuthRepository.sessionToken. SSE
 * streaming on Android uses OkHttp + a manual line parser; we don't have a
 * cross-platform EventSource in Kotlin and Android's HttpsURLConnection doesn't
 * surface `text/event-stream` as a typed stream.
 *
 * Until the backend is live, every call returns a deterministic MOCK stream
 * (set `MOCK = true` in the call sites, or rely on the default below). Switching
 * to real is a one-line `MOCK = false` once the Worker endpoint is up.
 */
package com.pulse.android.data.api

import com.pulse.android.data.auth.models.User
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

data class ModelInfo(
    val id: String,
    val displayName: String,
    val tier: String,                // "free" | "pro"
    val kind: String,                // "local" | "server"
    val contextWindow: Int = 8192,
)

data class UsageInfo(
    val neuronsUsed: Long,
    val requests: Long,
    val limit: Long,                 // -1 for unlimited
    val resetAt: Long = 0L,
)

sealed class AiError(val message: String) {
    object Unavailable : AiError("Server unavailable.")
    object ProRequired : AiError("Cloud AI is a PRO feature.")
    object RateLimited : AiError("Daily limit reached. Try again tomorrow or upgrade to PRO.")
    class Server(val code: Int, val detail: String?) : AiError("Server error $code")
    class Network(val cause: String) : AiError("Network error: $cause")

    /** Bridge to Throwable for `throw` interop. */
    fun toThrowable(): Throwable = RuntimeException(message)
}

class AiApi(
    private val baseUrl: String = "https://api.ownlocalml.com",
    private val client: OkHttpClient = defaultClient(),
) {
    companion object {
        /**
         * Master switch. When the Cloudflare Worker is up, flip this to false and
         * the client hits the real endpoints. Today it's a mock so the UI is
         * end-to-end testable without a server.
         */
        const val MOCK = true

        fun defaultClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.SECONDS)   // no read timeout for SSE
            .build()

        val MODELS: List<ModelInfo> = listOf(
            ModelInfo("auto", "Auto (recommended)", tier = "free", kind = "auto", contextWindow = 8192),
            ModelInfo("local-gemma3-4b", "Local · Gemma 3 4B (Q4_K_M)", tier = "free", kind = "local", contextWindow = 4096),
            ModelInfo("server-llama-3.1-8b", "Cloud · Llama 3.1 8B (fast)", tier = "free", kind = "server", contextWindow = 16384),
            ModelInfo("server-llama-3.3-70b", "Cloud · Llama 3.3 70B (smart)", tier = "pro", kind = "server", contextWindow = 32768),
        )

        fun isProModel(id: String): Boolean =
            MODELS.firstOrNull { it.id == id }?.tier == "pro"
    }

    /**
     * Stream an assistant response.
     *
     * Yields one [String] per SSE `data: <token>` frame. The last emitted value is
     * a meta event ("[DONE]") so callers can distinguish "stream finished" from
     * "no tokens yet".
     */
    fun streamChat(
        model: String,
        messages: List<Pair<String, String>>,   // (role, content) pairs
        token: String? = null,                  // Bearer token (if any)
        user: User? = null,                     // used to gate pro models
    ): Flow<String> = flow {
        if (MOCK) {
            streamMock(model, messages, user).collect { emit(it) }
            return@flow
        }
        val req = buildChatRequest(model, messages, token)
        try {
            client.newCall(req).execute().use { resp ->
                if (resp.code == 401) throw AiError.ProRequired.toThrowable()
                if (resp.code == 402 || resp.code == 403) throw AiError.ProRequired.toThrowable()
                if (resp.code == 429) throw AiError.RateLimited.toThrowable()
                if (resp.code in 500..599) throw AiError.Server(resp.code, null).toThrowable()
                if (!resp.isSuccessful) throw AiError.Server(resp.code, null).toThrowable()
                val source = resp.body?.source() ?: throw AiError.Network("empty body").toThrowable()
                val decoder = java.io.InputStreamReader(source.inputStream(), Charsets.UTF_8)
                val reader = decoder.buffered()
                var currentEvent: String? = null
                while (true) {
                    val line = reader.readLine() ?: break
                    when {
                        line.isEmpty() -> {
                            currentEvent = null
                        }
                        line.startsWith(":") -> {
                            // SSE comment, ignore
                        }
                        line.startsWith("event:") -> {
                            currentEvent = line.substringAfter("event:").trim()
                        }
                        line.startsWith("data:") -> {
                            val data = line.substringAfter("data:").trim()
                            if (data == "[DONE]") {
                                emit("[DONE]")
                                break
                            }
                            // data may be a token (string) or JSON {delta: "..."}
                            val tokenStr = parseSseData(data)
                            if (tokenStr.isNotEmpty()) emit(tokenStr)
                        }
                    }
                }
            }
        } catch (e: java.io.IOException) {
            throw AiError.Network(e.message ?: "io").toThrowable()
        } catch (e: Exception) {
            throw AiError.Server(-1, e.message).toThrowable()
        }
    }.flowOn(Dispatchers.IO)

    /**
     * Returns the list of models available to this user. License-aware.
     */
    fun listModels(user: User? = null): List<ModelInfo> {
        return MODELS.map { m ->
            if (m.tier == "pro" && (user == null || user.tier != "pro")) {
                m.copy(displayName = m.displayName + " · PRO")
            } else m
        }
    }

    /**
     * Returns the current usage for the signed-in user.
     */
    suspend fun getUsage(token: String?): UsageInfo {
        if (MOCK) {
            return mockUsage()
        }
        val req = Request.Builder()
            .url("$baseUrl/api/ai/usage")
            .get()
            .apply { if (token != null) header("Authorization", "Bearer $token") }
            .build()
        return try {
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) mockUsage() // graceful fallback
                else parseUsage(resp.body?.string().orEmpty())
            }
        } catch (_: Exception) {
            mockUsage()
        }
    }

    // ----- Mock streams (used when MOCK = true) -----

    private fun streamMock(
        model: String,
        messages: List<Pair<String, String>>,
        user: User?,
    ): Flow<String> = flow {
        if (isProModel(model) && (user == null || user.tier != "pro")) {
            emit("[BLOCKED] PRO license required for $model. Switch to 'Auto' or 'Cloud · Llama 8B'.")
            emit("[DONE]")
            return@flow
        }
        val lastUser = messages.lastOrNull { it.first == "user" }?.second.orEmpty()
        val reply = buildMockReply(model, lastUser)
        val tokens = reply.split(" ")
        for (t in tokens) {
            emit(t + " ")
            delay(40)   // ~25 tok/sec — feels like streaming
        }
        emit("[DONE]")
    }.flowOn(Dispatchers.IO)

    private fun buildMockReply(model: String, userText: String): String {
        val pick = when {
            userText.isBlank() -> "Hello! Ask me anything about your notes."
            userText.contains(Regex("(?i)\\b(summary|summari[sz]e)\\b")) ->
                "Here's a quick summary: your notes cover " + sampleTopic(userText) +
                    ". The main themes are local-first sync, end-to-end encryption, and offline-friendly editing."
            userText.contains(Regex("(?i)\\b(plan|next|todo|step)\\b")) ->
                "Here's a plan I would try: 1) decide the smallest useful slice, 2) ship it, 3) measure, 4) iterate. Aim for one win per day."
            userText.contains(Regex("(?i)\\b(what|who|where|when|why|how)\\b")) ->
                "Good question. " + sampleTopic(userText) + " — I would look at the source, check the docs, and if it's still unclear, ask the maintainer."
            else -> sampleTopic(userText) + " — let me know if you want me to dig into a specific aspect."
        }
        val prefix = when (model) {
            "server-llama-3.3-70b" -> "[70B] "
            "server-llama-3.1-8b" -> "[8B] "
            "local-gemma3-4b" -> "[local] "
            else -> "[auto] "
        }
        return prefix + pick
    }

    private fun sampleTopic(text: String): String {
        val lc = text.lowercase()
        return when {
            "pulse" in lc -> "Pulse is a local-first notes app with backlinks, voice input, and AI chat."
            "android" in lc -> "The Android client is built with Kotlin + Compose, ships as a single ~5 MB APK."
            "license" in lc || "pro" in lc -> "PRO unlocks cloud-side Llama 70B and cross-device sync."
            "sync" in lc -> "Sync is end-to-end encrypted (AES-256-GCM, scrypt KDF), with the password as the only key."
            "svelte" in lc || "react" in lc -> "The web app uses Svelte 5 + SvelteKit; Android is a separate Kotlin codebase."
            else -> "This is a mock response — wire a real backend and the same client streams real tokens."
        }
    }

    private fun mockUsage(): UsageInfo = UsageInfo(
        neuronsUsed = 47_000L,
        requests = 12L,
        limit = 200_000L,
        resetAt = 0L,
    )

    // ----- Real request building -----

    private fun buildChatRequest(
        model: String,
        messages: List<Pair<String, String>>,
        token: String?,
    ): Request {
        val body = JSONObject().apply {
            put("model", model)
            put("stream", true)
            val arr = org.json.JSONArray()
            for ((role, content) in messages) {
                arr.put(JSONObject().put("role", role).put("content", content))
            }
            put("messages", arr)
        }
        val media = "application/json; charset=utf-8".toMediaType()
        val builder = Request.Builder()
            .url("$baseUrl/api/ai/chat")
            .post(body.toString().toRequestBody(media))
            .header("Accept", "text/event-stream")
            .header("Cache-Control", "no-cache")
        if (token != null) builder.header("Authorization", "Bearer $token")
        return builder.build()
    }

    private fun parseSseData(data: String): String {
        // Allow either plain-token (e.g. "hello world") or OpenAI-style JSON
        // ({"delta": {"content": "..."}} or {"choices": [{"delta": {"content": "..."}}]}).
        return try {
            val obj = JSONObject(data)
            when {
                obj.has("delta") -> obj.optJSONObject("delta")?.optString("content", "").orEmpty()
                obj.has("choices") -> obj.optJSONArray("choices")
                    ?.optJSONObject(0)
                    ?.optJSONObject("delta")
                    ?.optString("content", "").orEmpty()
                obj.has("content") -> obj.optString("content")
                obj.has("token") -> obj.optString("token")
                else -> data
            }
        } catch (_: Exception) {
            // Plain string token
            data
        }
    }

    private fun parseUsage(json: String): UsageInfo = try {
        val obj = JSONObject(json)
        UsageInfo(
            neuronsUsed = obj.optLong("neurons_used", 0),
            requests = obj.optLong("requests", 0),
            limit = obj.optLong("limit", 200_000),
            resetAt = obj.optLong("reset_at", 0),
        )
    } catch (_: Exception) {
        mockUsage()
    }
}
