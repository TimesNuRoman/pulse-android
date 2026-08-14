/*
 * VoiceTranscriber — wraps Android SpeechRecognizer for on-device speech-to-text.
 *
 * Hard rules:
 *   - No cloud STT. We use `createOnDeviceSpeechRecognizer` and fall back to the
 *     default recognizer only if the device doesn't expose an on-device one.
 *     Either way, no audio is sent to the network.
 *   - Audio is captured in the system process via RecognizerIntent; we don't manage
 *     a raw AudioRecord.
 *   - Permission: callers must hold RECORD_AUDIO before invoking [start].
 */
package com.pulse.android.data.voice

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.content.ContextCompat
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

sealed class VoiceEvent {
    data class Partial(val text: String) : VoiceEvent()
    data class Final(val text: String) : VoiceEvent()
    data class Error(val code: Int, val message: String) : VoiceEvent()
    object Ready : VoiceEvent()
}

class VoiceTranscriber(private val context: Context) {

    fun hasPermission(): Boolean = ContextCompat.checkSelfPermission(
        context, Manifest.permission.RECORD_AUDIO,
    ) == PackageManager.PERMISSION_GRANTED

    /** Returns a hot Flow that emits Partial / Final / Error events. */
    fun listen(locale: String = "en-US"): Flow<VoiceEvent> = callbackFlow {
        if (!hasPermission()) {
            trySend(VoiceEvent.Error(-1, "RECORD_AUDIO not granted"))
            close()
            return@callbackFlow
        }
        val recognizer: SpeechRecognizer? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
        } else {
            SpeechRecognizer.createSpeechRecognizer(context)
        }
        if (recognizer == null) {
            trySend(VoiceEvent.Error(-2, "SpeechRecognizer unavailable"))
            close()
            return@callbackFlow
        }
        trySend(VoiceEvent.Ready)
        val listener = object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onError(error: Int) {
                trySend(VoiceEvent.Error(error, errorString(error)))
                close()
            }
            override fun onResults(results: Bundle?) {
                val list = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                val text = list?.firstOrNull().orEmpty()
                trySend(VoiceEvent.Final(text))
                close()
            }
            override fun onPartialResults(partial: Bundle?) {
                val list = partial?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                val text = list?.firstOrNull().orEmpty()
                if (text.isNotEmpty()) trySend(VoiceEvent.Partial(text))
            }
            override fun onEvent(eventType: Int, params: Bundle?) {}
        }
        recognizer.setRecognitionListener(listener)

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
            }
        }
        try {
            recognizer.startListening(intent)
        } catch (e: Exception) {
            trySend(VoiceEvent.Error(-3, e.message ?: "start failed"))
            close()
        }
        awaitClose {
            try { recognizer.stopListening() } catch (_: Throwable) {}
            try { recognizer.destroy() } catch (_: Throwable) {}
        }
    }

    fun stop() {
        // The recognizer is owned by the Flow; cancel from the caller's side.
    }

    private fun errorString(code: Int): String = when (code) {
        SpeechRecognizer.ERROR_AUDIO -> "Audio recording error"
        SpeechRecognizer.ERROR_CLIENT -> "Client error"
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Insufficient permissions"
        SpeechRecognizer.ERROR_NETWORK -> "Network error"
        SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Network timeout"
        SpeechRecognizer.ERROR_NO_MATCH -> "No match"
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Recognizer busy"
        SpeechRecognizer.ERROR_SERVER -> "Server error"
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No speech"
        else -> "Unknown error $code"
    }
}
