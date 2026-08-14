/*
 * Pulse LLM — native bridge.
 *
 * Compiles TWO ways:
 *   - PULSE_LLM_STUB=1 (default OFF in this branch): the stub from the
 *     earlier days emits a placeholder stream. Useful for testing the
 *     Kotlin side without compiling llama.cpp.
 *   - PULSE_LLM_STUB=0 (default for v0.2.0-rc-jni): real llama.cpp is
 *     linked into the same .so. nativeLoad / nativeGenerate / nativeUnload
 *     drive llama_model_load_from_file + llama_decode + llama_sampler_sample
 *     in a loop, emitting one token per callback.
 *
 * The JNI signatures are the same in both modes — Kotlin's LlamaEngine.kt
 * doesn't need to know which mode we built.
 */
#include <jni.h>
#include <android/log.h>
#include <cstring>
#include <cstdlib>
#include <string>
#include <thread>
#include <atomic>
#include <chrono>
#include <vector>

#include "llama.h"

#define LOG_TAG "pulse_llm"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN, LOG_TAG, __VA_ARGS__)

namespace {

struct LlamaState {
    std::atomic<bool> loaded{false};
    std::atomic<bool> generating{false};
    std::string modelPath;
    int contextSize = 2048;
    int threads = 1;

    // Real llama.cpp state (only used when !stub).
    llama_model * model = nullptr;
    llama_context * ctx = nullptr;

    ~LlamaState() {
        if (ctx) llama_free(ctx);
        if (model) llama_model_free(model);
    }
};

LlamaState g_state;

// Resolve the Kotlin callback's invoke() method once per call site. The
// callback is `Function1<String, Unit>` from Kotlin; its Java shape is
// `invoke(String): Unit` in most cases.
bool resolveTokenCallback(JNIEnv* env, jobject onToken, jclass* outClass, jmethodID* outMethod) {
    jclass cbClass = env->GetObjectClass(onToken);
    if (cbClass == nullptr) return false;
    jmethodID cbMethod = env->GetMethodID(cbClass, "invoke", "(Ljava/lang/Object;)Ljava/lang/Object;");
    if (cbMethod == nullptr) {
        // fallback: single-arg, void return
        cbMethod = env->GetMethodID(cbClass, "invoke", "(Ljava/lang/String;)V");
    }
    if (cbMethod == nullptr) {
        env->DeleteLocalRef(cbClass);
        return false;
    }
    *outClass = cbClass;
    *outMethod = cbMethod;
    return true;
}

}  // namespace

// ---------------------------------------------------------------------------
// STUB MODE
// ---------------------------------------------------------------------------

#if PULSE_LLM_STUB

extern "C" {

JNIEXPORT jboolean JNICALL
Java_com_pulse_android_data_llm_LlamaEngine_nativeIsAvailable(JNIEnv*, jobject) {
    return JNI_TRUE;
}

JNIEXPORT jboolean JNICALL
Java_com_pulse_android_data_llm_LlamaEngine_nativeLoad(
    JNIEnv* env, jobject, jstring modelPath, jint contextSize, jint threads) {
    const char* path = env->GetStringUTFChars(modelPath, nullptr);
    g_state.modelPath = path ? path : "";
    env->ReleaseStringUTFChars(modelPath, path);
    g_state.contextSize = (int)contextSize;
    g_state.threads = (int)(threads > 0 ? threads : 1);
    g_state.loaded.store(true);
    LOGI("stub: model '%s' loaded (ctx=%d, threads=%d)",
         g_state.modelPath.c_str(), g_state.contextSize, g_state.threads);
    return JNI_TRUE;
}

JNIEXPORT void JNICALL
Java_com_pulse_android_data_llm_LlamaEngine_nativeUnload(JNIEnv*, jobject) {
    g_state.generating.store(false);
    g_state.loaded.store(false);
    g_state.modelPath.clear();
    LOGI("stub: model unloaded");
}

JNIEXPORT jboolean JNICALL
Java_com_pulse_android_data_llm_LlamaEngine_nativeIsLoaded(JNIEnv*, jobject) {
    return g_state.loaded.load() ? JNI_TRUE : JNI_FALSE;
}

namespace {
const char* kStubTokens[] = {
    "This ", "is ", "a ", "stub ", "response. ",
    "Drop ", "in ", "llama.cpp ", "and ", "rebuild ",
    "with ", "-DPULSE_LLM_STUB=0 ", "to ", "enable ",
    "real ", "inference.\n",
};
constexpr int kStubTokensCount = sizeof(kStubTokens) / sizeof(kStubTokens[0]);
}  // namespace

JNIEXPORT void JNICALL
Java_com_pulse_android_data_llm_LlamaEngine_nativeGenerate(
    JNIEnv* env, jobject, jstring prompt, jint maxTokens, jobject onToken) {
    (void)prompt;
    if (!g_state.loaded.load()) {
        LOGE("nativeGenerate called before nativeLoad");
        return;
    }
    g_state.generating.store(true);
    jclass cbClass; jmethodID cbMethod;
    if (!resolveTokenCallback(env, onToken, &cbClass, &cbMethod)) {
        LOGE("stub: could not resolve Kotlin callback invoke()");
        g_state.generating.store(false);
        return;
    }
    const int limit = (int)maxTokens > 0 ? (int)maxTokens : 256;
    for (int i = 0; i < kStubTokensCount && i < limit && g_state.generating.load(); ++i) {
        jstring token = env->NewStringUTF(kStubTokens[i]);
        env->CallVoidMethod(onToken, cbMethod, token);
        env->DeleteLocalRef(token);
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }
    env->DeleteLocalRef(cbClass);
    g_state.generating.store(false);
}

}  // extern "C"

// ---------------------------------------------------------------------------
// REAL LLAMA.CPP MODE
// ---------------------------------------------------------------------------

#else  // !PULSE_LLM_STUB

extern "C" {

JNIEXPORT jboolean JNICALL
Java_com_pulse_android_data_llm_LlamaEngine_nativeIsAvailable(JNIEnv*, jobject) {
    // We're built against llama.cpp, so the runtime IS available.
    return JNI_TRUE;
}

JNIEXPORT jboolean JNICALL
Java_com_pulse_android_data_llm_LlamaEngine_nativeLoad(
    JNIEnv* env, jobject, jstring modelPath, jint contextSize, jint threads) {

    // If a previous model is loaded, unload it first.
    if (g_state.ctx) { llama_free(g_state.ctx); g_state.ctx = nullptr; }
    if (g_state.model) { llama_model_free(g_state.model); g_state.model = nullptr; }
    g_state.loaded.store(false);

    const char* path = env->GetStringUTFChars(modelPath, nullptr);
    if (path == nullptr || path[0] == '\0') {
        LOGE("nativeLoad: empty model path");
        if (path) env->ReleaseStringUTFChars(modelPath, path);
        return JNI_FALSE;
    }
    g_state.modelPath = path;
    env->ReleaseStringUTFChars(modelPath, path);

    g_state.contextSize = (int)contextSize > 0 ? (int)contextSize : 2048;
    g_state.threads = (int)(threads > 0 ? threads : 1);

    LOGI("nativeLoad: loading '%s' (ctx=%d, threads=%d)",
         g_state.modelPath.c_str(), g_state.contextSize, g_state.threads);

    // Model params: CPU-only, mlock OFF, mmap ON (Android-friendly).
    llama_model_params model_params = llama_model_default_params();
    model_params.n_gpu_layers = 0;   // CPU only
    model_params.use_mmap = true;
    model_params.use_mlock = false;

    g_state.model = llama_model_load_from_file(g_state.modelPath.c_str(), model_params);
    if (g_state.model == nullptr) {
        LOGE("nativeLoad: llama_model_load_from_file failed for '%s'", g_state.modelPath.c_str());
        return JNI_FALSE;
    }

    llama_context_params ctx_params = llama_context_default_params();
    ctx_params.n_ctx = g_state.contextSize;
    ctx_params.n_threads = g_state.threads;
    ctx_params.n_threads_batch = g_state.threads;

    g_state.ctx = llama_new_context_with_model(g_state.model, ctx_params);
    if (g_state.ctx == nullptr) {
        LOGE("nativeLoad: llama_new_context_with_model failed");
        llama_model_free(g_state.model);
        g_state.model = nullptr;
        return JNI_FALSE;
    }

    g_state.loaded.store(true);
    const llama_vocab * vocab = llama_model_get_vocab(g_state.model);
    LOGI("nativeLoad: model ready (vocab_tokens=%d, ctx=%d)",
         llama_vocab_n_tokens(vocab), llama_n_ctx(g_state.ctx));
    return JNI_TRUE;
}

JNIEXPORT void JNICALL
Java_com_pulse_android_data_llm_LlamaEngine_nativeUnload(JNIEnv*, jobject) {
    g_state.generating.store(false);
    if (g_state.ctx) { llama_free(g_state.ctx); g_state.ctx = nullptr; }
    if (g_state.model) { llama_model_free(g_state.model); g_state.model = nullptr; }
    g_state.loaded.store(false);
    g_state.modelPath.clear();
    LOGI("nativeUnload: done");
}

JNIEXPORT jboolean JNICALL
Java_com_pulse_android_data_llm_LlamaEngine_nativeIsLoaded(JNIEnv*, jobject) {
    return (g_state.loaded.load() && g_state.ctx != nullptr) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT void JNICALL
Java_com_pulse_android_data_llm_LlamaEngine_nativeGenerate(
    JNIEnv* env, jobject, jstring prompt, jint maxTokens, jobject onToken) {

    if (!g_state.loaded.load() || g_state.ctx == nullptr || g_state.model == nullptr) {
        LOGE("nativeGenerate called before nativeLoad (or model unloaded)");
        return;
    }
    g_state.generating.store(true);

    jclass cbClass; jmethodID cbMethod;
    if (!resolveTokenCallback(env, onToken, &cbClass, &cbMethod)) {
        LOGE("nativeGenerate: could not resolve Kotlin callback invoke()");
        g_state.generating.store(false);
        return;
    }

    const int limit = (int)maxTokens > 0 ? (int)maxTokens : 256;
    const char* prompt_utf = env->GetStringUTFChars(prompt, nullptr);
    if (prompt_utf == nullptr) {
        env->DeleteLocalRef(cbClass);
        g_state.generating.store(false);
        return;
    }

    // --- Tokenize the prompt (BOS + content) ---
    const llama_vocab * vocab = llama_model_get_vocab(g_state.model);
    std::vector<llama_token> prompt_tokens(g_state.contextSize);
    int32_t n_prompt = llama_tokenize(
        vocab,
        prompt_utf, (int32_t)strlen(prompt_utf),
        prompt_tokens.data(), (int32_t)prompt_tokens.size(),
        /*add_special=*/ true, /*parse_special=*/ true);
    env->ReleaseStringUTFChars(prompt, prompt_utf);

    if (n_prompt < 0) {
        LOGE("nativeGenerate: tokenize failed (n=%d)", n_prompt);
        env->DeleteLocalRef(cbClass);
        g_state.generating.store(false);
        return;
    }
    LOGI("nativeGenerate: %d prompt tokens, max %d new tokens", n_prompt, limit);

    // --- Greedy sampler (deterministic, no temperature/top_k/top_p) ---
    // Good enough for a "first real" build; the Settings screen can
    // expose temperature later.
    llama_sampler * smpl = llama_sampler_init_greedy();
    if (smpl == nullptr) {
        LOGE("nativeGenerate: llama_sampler_init_greedy returned null");
        env->DeleteLocalRef(cbClass);
        g_state.generating.store(false);
        return;
    }

    // --- Prefill: feed the prompt tokens ---
    {
        llama_batch batch = llama_batch_get_one(prompt_tokens.data(), n_prompt);
        if (llama_decode(g_state.ctx, batch) != 0) {
            LOGE("nativeGenerate: prefill decode failed");
            llama_sampler_free(smpl);
            env->DeleteLocalRef(cbClass);
            g_state.generating.store(false);
            return;
        }
    }
    // After prefill, "accept" each prompt token into the sampler state.
    for (int32_t i = 0; i < n_prompt; ++i) {
        llama_sampler_accept(smpl, prompt_tokens[i]);
    }

    // --- Generation loop ---
    const llama_token eos = llama_vocab_eos(vocab);
    char piece_buf[64];
    int32_t emitted = 0;

    while (emitted < limit && g_state.generating.load()) {
        // Sample next token. -1 = use last logits (most recent token's logits).
        llama_token id = llama_sampler_sample(smpl, g_state.ctx, -1);
        if (id == eos) {
            LOGI("nativeGenerate: hit EOS at token %d", emitted);
            break;
        }
        // Token -> text. Returns the number of bytes written.
        int32_t n_piece = llama_token_to_piece(vocab, id, piece_buf, sizeof(piece_buf), 0, /*special=*/false);
        if (n_piece > 0) {
            jstring token_str = env->NewStringUTF(piece_buf);
            env->CallVoidMethod(onToken, cbMethod, token_str);
            env->DeleteLocalRef(token_str);
        }
        // Accept the token (so the sampler state stays consistent on
        // the next iteration) and feed it back as the next batch entry.
        llama_sampler_accept(smpl, id);
        llama_batch next = llama_batch_get_one(&id, 1);
        if (llama_decode(g_state.ctx, next) != 0) {
            LOGE("nativeGenerate: decode step failed at token %d", emitted);
            break;
        }
        emitted++;
    }

    llama_sampler_free(smpl);
    env->DeleteLocalRef(cbClass);
    g_state.generating.store(false);
    LOGI("nativeGenerate: emitted %d tokens", emitted);
}

}  // extern "C"

#endif  // PULSE_LLM_STUB
