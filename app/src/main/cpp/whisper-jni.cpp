/*
 * Pulse Whisper — native bridge.
 *
 * Wraps whisper.cpp v1.8.4 behind a tiny JNI surface so the Kotlin
 * `WhisperNative` class can drive on-device speech-to-text without
 * going through the system SpeechRecognizer (which can silently fall
 * back to cloud on some devices).
 *
 * The library is `pulse_whisper.so`. It bundles whisper.cpp + its
 * own private copy of ggml (a different version than the one
 * linked into pulse_llm.so).
 *
 * Public JNI surface (see WhisperNative.kt):
 *   nativeIsAvailable()      -> Boolean
 *   nativeVersion()          -> String  ("1.8.4")
 *   nativeInit(path, threads) -> Boolean
 *   nativeRelease()          -> void
 *   nativeTranscribe(samples, sampleRate, language) -> String
 *   nativeIsLoaded()         -> Boolean
 *
 * The PCM input is expected to be Float32 mono at the given sample
 * rate. whisper.cpp expects WHISPER_SAMPLE_RATE = 16000; if the
 * caller's sample rate differs, we resample with simple linear
 * interpolation (no anti-aliasing filter, but good enough for
 * voice notes that are already speech-band-limited).
 */
#include <jni.h>
#include <android/log.h>
#include <cstring>
#include <cstdlib>
#include <cstdio>
#include <string>
#include <thread>
#include <atomic>
#include <vector>
#include <algorithm>

#include "whisper.h"

#define LOG_TAG "pulse_whisper"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO,  LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN,  LOG_TAG, __VA_ARGS__)

namespace {

struct WhisperState {
    std::atomic<bool> loaded{false};
    std::string modelPath;
    int threads = 1;

    whisper_context * ctx = nullptr;

    ~WhisperState() {
        if (ctx) whisper_free(ctx);
    }
};

WhisperState g_state;

// Resample `in` (length n_in, originally at sample_rate_in) to
// `out` (length n_out) at WHISPER_SAMPLE_RATE (16 kHz) using linear
// interpolation. Whisper always expects 16 kHz mono Float32.
void resample_to_16k(const float * in, int n_in, int sample_rate_in,
                     std::vector<float> & out) {
    constexpr int OUT_RATE = WHISPER_SAMPLE_RATE;  // 16000
    if (sample_rate_in == OUT_RATE || n_in <= 0) {
        out.assign(in, in + n_in);
        return;
    }
    // Compute output length proportional to the rate ratio.
    const double ratio = static_cast<double>(sample_rate_in) / static_cast<double>(OUT_RATE);
    const int n_out = static_cast<int>(n_in / ratio);
    out.resize(n_out);
    for (int i = 0; i < n_out; ++i) {
        const double src_idx = i * ratio;
        const int i0 = static_cast<int>(src_idx);
        const int i1 = std::min(i0 + 1, n_in - 1);
        const double t = src_idx - i0;
        out[i] = static_cast<float>(in[i0] * (1.0 - t) + in[i1] * t);
    }
}

// Look up whisper's language id from a BCP-47-ish code (e.g. "en",
// "ru", "auto"). whisper.cpp supports a fixed list; see whisper.h
// for the canonical list. Returns -1 for "auto" (let whisper detect).
int language_id(const char * lang) {
    if (lang == nullptr || lang[0] == '\0') return -1;
    if (strcmp(lang, "auto") == 0) return -1;
    // Common subset. whisper_lang_id() returns -1 for unknown.
    const int id = whisper_lang_id(lang);
    return id;
}

}  // namespace

extern "C" {

JNIEXPORT jboolean JNICALL
Java_com_pulse_android_data_voice_WhisperNative_nativeIsAvailable(JNIEnv*, jobject) {
    return JNI_TRUE;
}

JNIEXPORT jstring JNICALL
Java_com_pulse_android_data_voice_WhisperNative_nativeVersion(JNIEnv* env, jobject) {
    return env->NewStringUTF(whisper_version());
}

JNIEXPORT jboolean JNICALL
Java_com_pulse_android_data_voice_WhisperNative_nativeInit(
    JNIEnv* env, jobject, jstring modelPath, jint threads) {

    if (g_state.ctx) {
        whisper_free(g_state.ctx);
        g_state.ctx = nullptr;
        g_state.loaded.store(false);
    }

    const char * path = env->GetStringUTFChars(modelPath, nullptr);
    if (path == nullptr || path[0] == '\0') {
        LOGE("nativeInit: empty model path");
        if (path) env->ReleaseStringUTFChars(modelPath, path);
        return JNI_FALSE;
    }
    g_state.modelPath = path;
    env->ReleaseStringUTFChars(modelPath, path);

    g_state.threads = (int)threads > 0 ? (int)threads : 1;

    LOGI("nativeInit: loading '%s' (threads=%d)", g_state.modelPath.c_str(), g_state.threads);

    whisper_context_params cparams = whisper_context_default_params();
    cparams.use_gpu = false;            // CPU only
    cparams.flash_attn = false;         // not supported on all CPUs

    g_state.ctx = whisper_init_from_file_with_params(g_state.modelPath.c_str(), cparams);
    if (g_state.ctx == nullptr) {
        LOGE("nativeInit: whisper_init_from_file_with_params failed for '%s'",
             g_state.modelPath.c_str());
        return JNI_FALSE;
    }

    g_state.loaded.store(true);
    LOGI("nativeInit: model ready");
    return JNI_TRUE;
}

JNIEXPORT void JNICALL
Java_com_pulse_android_data_voice_WhisperNative_nativeRelease(JNIEnv*, jobject) {
    if (g_state.ctx) {
        whisper_free(g_state.ctx);
        g_state.ctx = nullptr;
    }
    g_state.loaded.store(false);
    g_state.modelPath.clear();
    LOGI("nativeRelease: done");
}

JNIEXPORT jboolean JNICALL
Java_com_pulse_android_data_voice_WhisperNative_nativeIsLoaded(JNIEnv*, jobject) {
    return (g_state.loaded.load() && g_state.ctx != nullptr) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jstring JNICALL
Java_com_pulse_android_data_voice_WhisperNative_nativeTranscribe(
    JNIEnv* env, jobject,
    jfloatArray samples, jint sampleRate, jstring language) {

    if (!g_state.loaded.load() || g_state.ctx == nullptr) {
        LOGE("nativeTranscribe called before nativeInit");
        return env->NewStringUTF("");
    }

    jsize n_in = env->GetArrayLength(samples);
    if (n_in <= 0) {
        return env->NewStringUTF("");
    }
    jfloat * pcm_in = env->GetFloatArrayElements(samples, nullptr);
    if (pcm_in == nullptr) {
        LOGE("nativeTranscribe: GetFloatArrayElements failed");
        return env->NewStringUTF("");
    }

    // Resample to 16 kHz if needed.
    std::vector<float> pcm16k;
    resample_to_16k(pcm_in, (int)n_in, (int)sampleRate, pcm16k);
    env->ReleaseFloatArrayElements(samples, pcm_in, JNI_ABORT);

    if (pcm16k.empty()) {
        return env->NewStringUTF("");
    }

    // Pull language (nullable).
    const char * lang_cstr = language != nullptr ? env->GetStringUTFChars(language, nullptr) : nullptr;
    int lang_id = language_id(lang_cstr);
    if (lang_cstr != nullptr) env->ReleaseStringUTFChars(language, lang_cstr);

    // Build full params.
    whisper_full_params wparams = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    wparams.n_threads = g_state.threads;
    wparams.print_progress = false;
    wparams.print_realtime = false;
    wparams.print_timestamps = false;
    wparams.print_special = false;
    wparams.translate = false;
    wparams.no_context = true;            // do not carry state between calls
    wparams.single_segment = false;
    wparams.temperature = 0.0f;           // deterministic
    wparams.temperature_inc = 0.0f;
    wparams.greedy.best_of = 1;           // 1 = greedy (deterministic)
    wparams.beam_search.beam_size = 1;    // disabled
    wparams.language = (lang_id < 0) ? "auto" : whisper_lang_str(lang_id);
    wparams.detect_language = (lang_id < 0);

    LOGI("nativeTranscribe: %d samples (in @ %d Hz) -> %d samples @ 16 kHz, lang=%s",
         (int)n_in, (int)sampleRate, (int)pcm16k.size(),
         wparams.language);

    int rc = whisper_full(g_state.ctx, wparams, pcm16k.data(), (int)pcm16k.size());
    if (rc != 0) {
        LOGE("nativeTranscribe: whisper_full returned %d", rc);
        return env->NewStringUTF("");
    }

    // Concatenate segments.
    const int n_segments = whisper_full_n_segments(g_state.ctx);
    std::string text;
    text.reserve(256);
    for (int i = 0; i < n_segments; ++i) {
        const char * seg = whisper_full_get_segment_text(g_state.ctx, i);
        if (seg != nullptr) {
            text.append(seg);
        }
    }

    LOGI("nativeTranscribe: %d segments, %zu chars", n_segments, text.size());
    return env->NewStringUTF(text.c_str());
}

}  // extern "C"
