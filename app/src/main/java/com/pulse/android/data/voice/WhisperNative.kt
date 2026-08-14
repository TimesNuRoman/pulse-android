/*
 * WhisperNative — JNI wrapper around the local whisper.cpp runtime.
 *
 * This class is a thin Kotlin facade. The actual STT happens in C++ in
 * `app/src/main/cpp/whisper-jni.cpp`, which in turn calls into
 * whisper.cpp v1.8.4.
 *
 * Lifecycle:
 *   1. `init(path)` — loads the ggml-tiny.bin (or ggml-base.bin, etc.)
 *      from disk and allocates the whisper_context.
 *   2. `transcribe(samples, sampleRate, language)` — runs whisper_full
 *      and returns the recognized text as a single string.
 *   3. `release()` — frees the context.
 *
 * Audio format:
 *   - `samples` is a FloatArray of mono PCM in the range [-1.0, 1.0].
 *   - The native side resamples to WHISPER_SAMPLE_RATE (16 kHz) if
 *     the input is at a different rate.
 *
 * Models supported (curated, recommended first):
 *   - ggml-tiny.bin  (~75 MB)  — fastest, baseline accuracy
 *   - ggml-base.bin  (~142 MB) — better accuracy
 *   - ggml-small.bin (~466 MB) — high accuracy
 *   - ggml-tiny.en.bin / ggml-base.en.bin — English-only variants
 *
 * Models are stored in `filesDir/models/whisper/` and downloaded from
 * HuggingFace (ggerganov/whisper.cpp).
 */
package com.pulse.android.data.voice

class WhisperNative {

    /** True if the native library loaded successfully. */
    val isNativeReady: Boolean get() = nativeIsAvailable()

    /** Whisper.cpp version string (e.g. "1.8.4"). */
    val version: String get() = nativeVersion()

    /**
     * Load a ggml whisper model. Returns true on success.
     * @param modelPath absolute path to ggml-*.bin
     * @param threads 0 = use all available cores
     */
    fun init(modelPath: String, threads: Int = 0): Boolean =
        nativeInit(modelPath, if (threads == 0) Runtime.getRuntime().availableProcessors() else threads)

    fun release() { nativeRelease() }

    fun isLoaded(): Boolean = nativeIsLoaded()

    /**
     * Transcribe mono Float32 PCM. Returns the recognized text.
     * Empty string on failure or silence.
     *
     * @param samples mono PCM, range [-1.0, 1.0]
     * @param sampleRate input sample rate in Hz (16000 is ideal, others
     *                   are resampled with linear interpolation)
     * @param language BCP-47-ish code (e.g. "en", "ru") or "auto" for
     *                 autodetect. Empty string is treated as "auto".
     */
    fun transcribe(samples: FloatArray, sampleRate: Int, language: String = "auto"): String =
        nativeTranscribe(samples, sampleRate, language)

    // ----- JNI -----
    private external fun nativeIsAvailable(): Boolean
    private external fun nativeVersion(): String
    private external fun nativeInit(modelPath: String, threads: Int): Boolean
    private external fun nativeRelease()
    private external fun nativeIsLoaded(): Boolean
    private external fun nativeTranscribe(samples: FloatArray, sampleRate: Int, language: String): String

    companion object {
        init {
            try {
                System.loadLibrary("pulse_whisper")
            } catch (_: UnsatisfiedLinkError) {
                // Native lib not present in this build. `isNativeReady` will
                // report false and the UI should fall back to the system
                // SpeechRecognizer (or show "STT unavailable").
            }
        }
    }
}
