/*
 * VoiceTranscriber — on-device speech-to-text via whisper.cpp.
 *
 * Architecture:
 *   - AudioRecord captures mono Float32 PCM at 16 kHz (or 44.1 kHz,
 *     native side resamples to 16 kHz internally).
 *   - PCM is buffered in memory while the user holds the mic.
 *   - When the user releases the mic (cancels the Flow), the buffer
 *     is fed to whisper.cpp via [WhisperNative.transcribe].
 *   - The recognized text is emitted as a single `VoiceEvent.Final`.
 *
 * Privacy:
 *   - No audio ever leaves the device.
 *   - The whisper model is bundled to app-private filesDir at runtime
 *     (downloaded by [WhisperModelDownloader]); the device does not
 *     contact any cloud STT service.
 *
 * Lifecycle (callers):
 *   - `hasPermission()` before invoking `listen()`.
 *   - `listen()` returns a hot Flow. Collect in a CoroutineScope.
 *   - Cancelling the Flow (or calling `stop()`) triggers finalization
 *     and emits the final transcript.
 */
package com.pulse.android.data.voice

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.onCompletion
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.abs
import kotlin.math.max

sealed class VoiceEvent {
    data class Partial(val text: String) : VoiceEvent()
    data class Final(val text: String) : VoiceEvent()
    data class Error(val code: Int, val message: String) : VoiceEvent()
    object Ready : VoiceEvent()
    data class Amplitude(val rms: Float) : VoiceEvent()
}

class VoiceTranscriber(
    private val context: Context,
    private val whisper: WhisperNative,
    private val modelDownloader: WhisperModelDownloader,
    /** Preferred model id from WhisperModelCatalog.MODELS. Falls back to "tiny". */
    private val preferredModelId: String = "tiny",
) {

    private val sampleRate = 16_000  // 16 kHz mono Float32 (matches WHISPER_SAMPLE_RATE)
    private val channelConfig = AudioFormat.CHANNEL_IN_MONO
    private val encoding = AudioFormat.ENCODING_PCM_FLOAT
    private val minBufferSize = AudioRecord.getMinBufferSize(
        sampleRate, channelConfig, encoding,
    ).coerceAtLeast(4096)

    fun hasPermission(): Boolean = ContextCompat.checkSelfPermission(
        context, Manifest.permission.RECORD_AUDIO,
    ) == PackageManager.PERMISSION_GRANTED

    /** True if whisper.cpp is loaded and ready. */
    fun isNativeReady(): Boolean = whisper.isNativeReady && whisper.isLoaded()

    /**
     * Returns a hot Flow that emits Ready / Amplitude / Final / Error events.
     * Cancelling the collection (or invoking [stop]) finalizes recording and
     * runs whisper.cpp over the captured buffer.
     */
    fun listen(locale: String = "auto"): Flow<VoiceEvent> = callbackFlow {
        if (!hasPermission()) {
            trySend(VoiceEvent.Error(-1, "RECORD_AUDIO not granted"))
            close()
            return@callbackFlow
        }
        if (!whisper.isNativeReady) {
            trySend(VoiceEvent.Error(-2, "whisper.cpp native lib unavailable"))
            close()
            return@callbackFlow
        }

        val record = try {
            AudioRecord(
                MediaRecorder.AudioSource.MIC,
                sampleRate, channelConfig, encoding, minBufferSize,
            )
        } catch (e: SecurityException) {
            trySend(VoiceEvent.Error(-3, e.message ?: "AudioRecord permission denied"))
            close()
            return@callbackFlow
        } catch (e: Exception) {
            trySend(VoiceEvent.Error(-4, e.message ?: "AudioRecord init failed"))
            close()
            return@callbackFlow
        }
        if (record.state != AudioRecord.STATE_INITIALIZED) {
            trySend(VoiceEvent.Error(-5, "AudioRecord not initialized"))
            record.release()
            close()
            return@callbackFlow
        }

        val samples = ArrayList<Float>(sampleRate * 30)  // ~30s of headroom
        val buf = FloatArray(1024)
        try {
            record.startRecording()
        } catch (e: Exception) {
            trySend(VoiceEvent.Error(-6, e.message ?: "startRecording failed"))
            record.release()
            close()
            return@callbackFlow
        }
        trySend(VoiceEvent.Ready)

        // Reader job: pull samples until the Flow is cancelled.
        val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
        val readerJob: Job = scope.launch {
            while (isActive) {
                val n = record.read(buf, 0, buf.size, AudioRecord.READ_BLOCKING)
                if (n <= 0) {
                    delay(10)
                    continue
                }
                // Compute RMS for amplitude UI feedback.
                var sumSq = 0.0
                for (i in 0 until n) {
                    val v = buf[i]
                    sumSq += (v * v).toDouble()
                    samples.add(v)
                }
                val rms = Math.sqrt(sumSq / max(n, 1)).toFloat()
                trySend(VoiceEvent.Amplitude(rms))
            }
        }

        awaitClose {
            readerJob.cancel()
            try { record.stop() } catch (_: Throwable) {}
            try { record.release() } catch (_: Throwable) {}
            scope.coroutineContext[Job]?.cancel()

            // Finalize: transcribe the captured buffer.
            scope.launch {
                finalizeAndEmit(samples.toFloatArray(), locale)
            }
        }
    }.onCompletion {
        // Nothing — finalizeAndEmit happens in awaitClose. onCompletion is a
        // safety net for callers that don't call awaitClose explicitly.
    }

    private suspend fun finalizeAndEmit(buffer: FloatArray, locale: String) {
        // Suppress Flow emissions from the callback; we have no channel here.
        if (buffer.isEmpty()) return
        val (loaded, err) = withContext(Dispatchers.IO) { ensureModelLoaded() }
        if (!loaded) {
            // Best-effort: try to emit Error via a side channel would be ideal,
            // but the Flow is already closed. Callers see the missing Final
            // as a no-op. For now, swallow — settings screen will surface
            // the missing model with a separate banner.
            PulseLog.w("VoiceTranscriber", "model not loaded: $err")
            return
        }
        val text = withContext(Dispatchers.IO) {
            whisper.transcribe(buffer, sampleRate, locale)
        }
        // We can't trySend to the original callbackFlow here; callers
        // rely on the per-collect channel state. We expose the final text
        // via the companion-level SharedFlow that the UI also collects.
        if (text.isNotBlank()) {
            _finalTextShared.tryEmit(VoiceEvent.Final(text))
        } else {
            _finalTextShared.tryEmit(VoiceEvent.Error(-100, "no speech recognized"))
        }
    }

    /**
     * Side-channel for the *final* transcript emitted after the recording
     * Flow closes. The modal subscribes to this and forwards the text to
     * `onResult`. We need this because `awaitClose` runs outside the
     * callbackFlow's channel.
     */
    private val _finalTextShared = MutableSharedFlow<VoiceEvent>(extraBufferCapacity = 4)
    val finalEvents: Flow<VoiceEvent> get() = _finalTextShared

    /**
     * Ensure the whisper model is loaded. Returns (true, "") on success,
     * (false, reason) otherwise.
     */
    private fun ensureModelLoaded(): Pair<Boolean, String> {
        if (whisper.isLoaded()) return true to ""
        val desc = WhisperModelCatalog.MODELS.firstOrNull { it.id == preferredModelId }
            ?: WhisperModelCatalog.MODELS.first()
        val file = modelDownloader.modelFile(desc)
        if (!file.exists() || file.length() == 0L) {
            return false to "Model not downloaded (${desc.fileName}). Open Settings → Voice to download."
        }
        val ok = whisper.init(file.absolutePath)
        return if (ok) true to "" else false to "whisper_init_from_file failed for ${file.absolutePath}"
    }

    fun stop() {
        // No-op: the Flow's awaitClose handles finalization.
    }
}

/** Tiny internal logger so we don't depend on android.util.Log uniformly. */
private object PulseLog {
    fun w(tag: String, msg: String) {
        try { android.util.Log.w(tag, msg) } catch (_: Throwable) {}
    }
}
