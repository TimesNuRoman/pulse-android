/*
 * Pulse LLM — native bridge.
 *
 * By default this compiles to a stub (`PULSE_LLM_STUB=1`) that exposes the
 * full JNI surface LlamaEngine.kt calls. The stub:
 *   - Reports `nativeIsAvailable() == true` so the Kotlin side knows the .so loaded.
 *   - `nativeLoad(...)` simulates a successful model load (no FS read).
 *   - `nativeGenerate(...)` produces a short placeholder stream so the UI is
 *     end-to-end testable on a fresh build, without a real model on disk.
 *
 * To wire in real llama.cpp: define `PULSE_LLM_STUB=0` and add the llama.cpp
 * subdirectory + the corresponding `llama_*` calls inside `nativeGenerate`.
 * The JNI signatures MUST stay the same.
 */
#include <jni.h>
#include <android/log.h>
#include <cstring>
#include <cstdlib>
#include <string>
#include <thread>
#include <atomic>
#include <chrono>

#define LOG_TAG "pulse_llm"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

namespace {

struct LlamaState {
    std::atomic<bool> loaded{false};
    std::atomic<bool> generating{false};
    std::string modelPath;
    int contextSize = 2048;
    int threads = 1;
};

LlamaState g_state;

}  // namespace

extern "C" {

JNIEXPORT jboolean JNICALL
Java_com_pulse_android_data_llm_LlamaEngine_nativeIsAvailable(JNIEnv* env, jobject) {
    (void)env;
    return JNI_TRUE;
}

JNIEXPORT jboolean JNICALL
Java_com_pulse_android_data_llm_LlamaEngine_nativeLoad(
    JNIEnv* env, jobject, jstring modelPath, jint contextSize, jint threads) {
    (void)env;
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
    "This ",
    "is ",
    "a ",
    "stub ",
    "response. ",
    "Drop ",
    "in ",
    "llama.cpp ",
    "and ",
    "rebuild ",
    "with ",
    "-DPULSE_LLM_STUB=0 ",
    "to ",
    "enable ",
    "real ",
    "inference.\n",
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
    // Resolve the Kotlin callback: (String) -> Unit
    jclass cbClass = env->GetObjectClass(onToken);
    jmethodID cbMethod = env->GetMethodID(cbClass, "invoke", "(Ljava/lang/Object;)Ljava/lang/Object;");
    if (cbMethod == nullptr) {
        // Fallback: Kotlin function type uses invoke with Object return — try (Ljava/lang/String;)V
        cbMethod = env->GetMethodID(cbClass, "invoke", "(Ljava/lang/String;)V");
    }
    env->DeleteLocalRef(cbClass);
    if (cbMethod == nullptr) {
        LOGE("could not resolve Kotlin callback invoke()");
        g_state.generating.store(false);
        return;
    }

    const int limit = (int)maxTokens > 0 ? (int)maxTokens : 256;
    for (int i = 0; i < kStubTokensCount && i < limit && g_state.generating.load(); ++i) {
        jstring token = env->NewStringUTF(kStubTokens[i]);
        env->CallVoidMethod(onToken, cbMethod, token);
        env->DeleteLocalRef(token);
        // Yield a bit so the UI can paint.
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }
    g_state.generating.store(false);
}

}  // extern "C"
