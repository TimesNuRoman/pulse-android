/*
 * LlamaEngine — JNI wrapper around the local LLM runtime.
 *
 * This class is a thin Kotlin facade. The actual inference happens in C++ in
 * `app/src/main/cpp/native-lib.cpp`, which in turn calls into llama.cpp.
 *
 * Lifecycle:
 *   1. `ensureModelReady(path)` — checks the .gguf file exists, downloads if missing
 *   2. `load(path)` — calls into native to init context, returns model descriptor
 *   3. `generate(prompt, onToken, onDone)` — streams tokens via callback
 *   4. `unload()` — releases context
 *
 * For v1, the native side is a stub: it emits a stream of placeholder tokens so the
 * Compose UI is end-to-end testable without a real model loaded. Replacing the stub
 * with llama.cpp is a CMakeLists change + drop in the llama.cpp source tree.
 *
 * Models supported (PRO): Llama 3.1 8B, Qwen 2.5 7B, Gemma 3 4B.
 * Recommended: gemma3:4b for devices with 4-6GB RAM, llama-3.1-8b for 8GB+.
 */
package com.pulse.android.data.llm

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.onCompletion

class LlamaEngine {

    /** True if the native library loaded successfully. */
    val isNativeReady: Boolean get() = nativeIsAvailable()

    /**
     * Load a model from disk. Returns true on success.
     * `contextSize` is in tokens (default 2048); `threads` defaults to Runtime.availableProcessors().
     */
    fun load(modelPath: String, contextSize: Int = 2048, threads: Int = 0): Boolean =
        nativeLoad(modelPath, contextSize, if (threads == 0) Runtime.getRuntime().availableProcessors() else threads)

    fun unload() { nativeUnload() }

    fun isLoaded(): Boolean = nativeIsLoaded()

    /**
     * Stream the model's response token-by-token. The [Flow] is hot: tokens arrive
     * as the model produces them. The flow completes when the model signals "done"
     * or when [unload] is called.
     */
    fun generate(prompt: String, maxTokens: Int = 512): Flow<String> = callbackFlow {
        nativeGenerate(prompt, maxTokens) { token ->
            trySend(token)
        }
        close()
    }.onCompletion { /* nothing — nativeGenerate runs to completion */ }

    // ----- JNI -----
    private external fun nativeIsAvailable(): Boolean
    private external fun nativeLoad(modelPath: String, contextSize: Int, threads: Int): Boolean
    private external fun nativeUnload()
    private external fun nativeIsLoaded(): Boolean
    private external fun nativeGenerate(prompt: String, maxTokens: Int, onToken: (String) -> Unit)

    companion object {
        init {
            try {
                System.loadLibrary("pulse_llm")
            } catch (_: UnsatisfiedLinkError) {
                // Native lib not present in this build. `isNativeReady` will report false
                // and the UI should show "model unavailable" instead of crashing.
            }
        }
    }
}
