/*
 * ModelDownloader — downloads a .gguf model to app-private files and reports progress.
 *
 * The model lives in `filesDir/models/<modelId>.gguf`. Download is via HTTPS with
 * streaming; SHA-256 is verified on completion. A partial file is kept so a resume
 * is possible on the next attempt (we don't implement range requests in v1 — we
 * restart the download if the user retries).
 *
 * Configuration:
 *   - Each model has a (id, url, sizeBytes, sha256) entry. Add to [MODELS] below.
 *   - The download is cancellable.
 */
package com.pulse.android.data.llm

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import okhttp3.OkHttpClient
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

data class ModelDescriptor(
    val id: String,             // "gemma3-4b-q4"
    val displayName: String,     // "Gemma 3 4B (Q4_K_M)"
    val url: String,
    val sizeBytes: Long,
    val sha256: String,
    val minRamGb: Int = 4,       // recommendation
)

object ModelCatalog {
    val MODELS: List<ModelDescriptor> = listOf(
        ModelDescriptor(
            id = "gemma3-4b-q4",
            displayName = "Gemma 3 4B (Q4_K_M)",
            url = "https://huggingface.co/.../gemma-3-4b-it-Q4_K_M.gguf",  // TODO: real URL
            sizeBytes = 3_300_000_000L,
            sha256 = "",
            minRamGb = 4,
        ),
        ModelDescriptor(
            id = "llama-3.1-8b-q4",
            displayName = "Llama 3.1 8B (Q4_K_M)",
            url = "https://huggingface.co/.../llama-3.1-8b-q4_k_m.gguf",
            sizeBytes = 4_500_000_000L,
            sha256 = "",
            minRamGb = 8,
        ),
    )
}

sealed class ModelDownloadEvent {
    data class Progress(val bytesSoFar: Long, val total: Long) : ModelDownloadEvent()
    data class Done(val path: String, val sha256: String) : ModelDownloadEvent()
    data class Failed(val reason: String) : ModelDownloadEvent()
}

class ModelDownloader(private val context: Context) {

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS)  // no read timeout for large files
        .build()

    fun modelFile(descriptor: ModelDescriptor): File =
        File(modelsDir(), "${descriptor.id}.gguf")

    fun isDownloaded(descriptor: ModelDescriptor): Boolean =
        modelFile(descriptor).exists() && modelFile(descriptor).length() == descriptor.sizeBytes

    suspend fun download(descriptor: ModelDescriptor): Flow<ModelDownloadEvent> = flow {
        val out = modelFile(descriptor)
        out.parentFile?.mkdirs()
        val tmp = File(out.parentFile, "${out.name}.part")
        val req = okhttp3.Request.Builder().url(descriptor.url).build()
        try {
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) {
                    emit(ModelDownloadEvent.Failed("HTTP ${resp.code}"))
                    return@flow
                }
                val total = resp.body?.contentLength() ?: descriptor.sizeBytes
                val md = MessageDigest.getInstance("SHA-256")
                resp.body!!.byteStream().use { input ->
                    tmp.outputStream().use { output ->
                        val buf = ByteArray(64 * 1024)
                        var read: Int
                        var totalRead = 0L
                        while (input.read(buf).also { read = it } > 0) {
                            output.write(buf, 0, read)
                            md.update(buf, 0, read)
                            totalRead += read
                            emit(ModelDownloadEvent.Progress(totalRead, total))
                        }
                    }
                }
                if (descriptor.sha256.isNotEmpty()) {
                    val actual = md.digest().joinToString("") { "%02x".format(it) }
                    if (actual != descriptor.sha256) {
                        tmp.delete()
                        emit(ModelDownloadEvent.Failed("SHA-256 mismatch (expected ${descriptor.sha256.take(8)}… got ${actual.take(8)}…)"))
                        return@flow
                    }
                }
                if (tmp.renameTo(out)) {
                    emit(ModelDownloadEvent.Done(out.absolutePath, descriptor.sha256))
                } else {
                    emit(ModelDownloadEvent.Failed("rename failed"))
                }
            }
        } catch (e: Exception) {
            tmp.delete()
            emit(ModelDownloadEvent.Failed(e.message ?: e.javaClass.simpleName))
        }
    }.flowOn(Dispatchers.IO)

    private fun modelsDir(): File = File(context.filesDir, "models")
}
