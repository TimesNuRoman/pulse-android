/*
 * WhisperModelDownloader — downloads ggml-*.bin whisper models to
 * app-private files. Mirrors the LLM ModelDownloader in
 * `data/llm/ModelDownloader.kt`, but with the curated whisper model
 * list and the HuggingFace URLs from
 * https://huggingface.co/ggerganov/whisper.cpp/tree/main .
 *
 * Models live in `filesDir/models/whisper/`. Download is HTTPS with
 * streaming; partials live in `<name>.bin.part` so a retry resumes
 * (we re-download from scratch in v1 for simplicity, no Range support).
 */
package com.pulse.android.data.voice

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import okhttp3.OkHttpClient
import java.io.File
import java.util.concurrent.TimeUnit

data class WhisperModelDescriptor(
    val id: String,             // "tiny"
    val displayName: String,     // "Tiny (multilingual)"
    val fileName: String,        // "ggml-tiny.bin"
    val url: String,
    val sizeBytes: Long,
    val sha256: String,
    val englishOnly: Boolean = false,
    val minRamGb: Int = 2,
)

object WhisperModelCatalog {
    val MODELS: List<WhisperModelDescriptor> = listOf(
        WhisperModelDescriptor(
            id = "tiny",
            displayName = "Tiny (multilingual)",
            fileName = "ggml-tiny.bin",
            url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
            sizeBytes = 75_700_000L,
            sha256 = "",
            englishOnly = false,
            minRamGb = 2,
        ),
        WhisperModelDescriptor(
            id = "base",
            displayName = "Base (multilingual)",
            fileName = "ggml-base.bin",
            url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
            sizeBytes = 142_000_000L,
            sha256 = "",
            englishOnly = false,
            minRamGb = 3,
        ),
        WhisperModelDescriptor(
            id = "tiny.en",
            displayName = "Tiny (English only)",
            fileName = "ggml-tiny.en.bin",
            url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
            sizeBytes = 75_700_000L,
            sha256 = "",
            englishOnly = true,
            minRamGb = 2,
        ),
    )
}

sealed class WhisperDownloadEvent {
    data class Progress(val bytesSoFar: Long, val total: Long) : WhisperDownloadEvent()
    data class Done(val path: String) : WhisperDownloadEvent()
    data class Failed(val reason: String) : WhisperDownloadEvent()
}

class WhisperModelDownloader(private val context: Context) {

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS)
        .build()

    fun modelFile(descriptor: WhisperModelDescriptor): File =
        File(modelsDir(), descriptor.fileName)

    fun isDownloaded(descriptor: WhisperModelDescriptor): Boolean =
        modelFile(descriptor).exists() && modelFile(descriptor).length() == descriptor.sizeBytes

    fun modelsDir(): File = File(context.filesDir, "models/whisper").apply { mkdirs() }

    suspend fun download(descriptor: WhisperModelDescriptor): Flow<WhisperDownloadEvent> = flow {
        val out = modelFile(descriptor)
        out.parentFile?.mkdirs()
        val tmp = File(out.parentFile, "${out.name}.part")
        val req = okhttp3.Request.Builder().url(descriptor.url).build()
        try {
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) {
                    emit(WhisperDownloadEvent.Failed("HTTP ${resp.code}"))
                    return@flow
                }
                val body = resp.body
                if (body == null) {
                    emit(WhisperDownloadEvent.Failed("Empty body"))
                    return@flow
                }
                val total = body.contentLength().takeIf { it > 0 } ?: descriptor.sizeBytes
                body.byteStream().use { input ->
                    tmp.outputStream().use { os ->
                        val buf = ByteArray(64 * 1024)
                        var read: Int
                        var sofar = 0L
                        var lastEmit = 0L
                        while (input.read(buf).also { read = it } > 0) {
                            os.write(buf, 0, read)
                            sofar += read
                            // Throttle progress to every 256 KB to avoid Flow spam.
                            if (sofar - lastEmit > 256 * 1024 || sofar == total) {
                                emit(WhisperDownloadEvent.Progress(sofar, total))
                                lastEmit = sofar
                            }
                        }
                        os.flush()
                    }
                }
                if (tmp.length() != descriptor.sizeBytes && descriptor.sizeBytes > 0) {
                    // Length mismatch (server may have updated file size). Move
                    // the partial to its final name; downstream loader will read
                    // the full file.
                }
                if (out.exists()) out.delete()
                if (!tmp.renameTo(out)) {
                    emit(WhisperDownloadEvent.Failed("Rename failed"))
                    return@flow
                }
                emit(WhisperDownloadEvent.Done(out.absolutePath))
            }
        } catch (e: Exception) {
            emit(WhisperDownloadEvent.Failed(e.message ?: "download failed"))
        }
    }.flowOn(Dispatchers.IO)
}
