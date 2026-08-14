# Pulse LLM — CMakeLists
#
# Builds the `pulse_llm` shared library that Pulse's Kotlin `LlamaEngine` loads.
# The default config produces a **stub** library that exposes the same JNI surface
# as the real backend, so the Android app builds, links, and runs end-to-end
# (with `isNativeReady == true` and a placeholder token stream).
#
# To wire in real llama.cpp (v0.2.0-rc-jni):
#   1. Vendor the llama.cpp source tree under `app/src/main/cpp/llama.cpp/`
#      (we vendor b9442 from https://github.com/ggml-org/llama.cpp).
#   2. Build with `-DPULSE_LLM_STUB=0` (the gradle default for debug+release).
#   3. Native side: stub JNI surface stays, but nativeGenerate now calls
#      llama_decode / llama_sampler_sample in a loop.
#
# We list the source files explicitly (no file(GLOB)) to avoid the
# CONFIGURE_DEPENDS re-configure loop that AGP 8.x can hit on incremental
# builds. The list is small and stable.
#
# ABI list (arm64-v8a, armeabi-v7a, x86_64) is set in app/build.gradle.kts.
cmake_minimum_required(VERSION 3.22.1)
# Enable both C and CXX so ggml's C files (ggml.c, ggml-alloc.c,
# ggml-quants.c) get compiled with the C compiler. Without C in
# the project language list, target_sources() may silently drop .c
# files from the build.
project(pulse_llm C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

option(PULSE_LLM_STUB "Build the stub LLM (no real inference)" OFF)

set(LLAMA_CPP_DIR "${CMAKE_CURRENT_SOURCE_DIR}/llama.cpp")

# Stub-only sources: when the stub is on, native-lib.cpp is the whole library.
# When it's off, native-lib.cpp provides the JNI bridge on top of llama.cpp.
add_library(pulse_llm SHARED native-lib.cpp)

target_include_directories(pulse_llm PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${LLAMA_CPP_DIR}/include
    ${LLAMA_CPP_DIR}/ggml/include
    ${LLAMA_CPP_DIR}/ggml/src          # for ggml-impl.h included by ggml-cpu/ggml-cpu-impl.h
    ${LLAMA_CPP_DIR}/src              # for llama-model.h included by models/models.h
    ${LLAMA_CPP_DIR}/common           # common helpers (some headers reach in here)
)

target_link_libraries(pulse_llm
    log
    android
)

if(PULSE_LLM_STUB)
    target_compile_definitions(pulse_llm PRIVATE PULSE_LLM_STUB=1)
else()
    target_compile_definitions(pulse_llm PRIVATE PULSE_LLM_STUB=0)

    # Tell llama.cpp / ggml we're cross-compiling for Android. These flags
    # would normally be set by llama.cpp's own CMake, but we drive it
    # manually here.
    target_compile_definitions(pulse_llm PRIVATE
        GGML_NATIVE=OFF
        GGML_OPENMP=OFF
        # GGML_VERSION and GGML_COMMIT are normally injected by the
        # upstream CMake via add_compile_definitions from version.cmake.
        # We're driving llama.cpp manually, so we hardcode the values
        # here. The user-visible strings only show in ggml_print_system
        # at startup; runtime behavior is unaffected.
        GGML_VERSION="0.9.4"
        GGML_COMMIT="b9442"
        # CPU-only: no CUDA, no Metal, no Vulkan, no OpenCL.
    )

    # ------------------------------------------------------------------
    # llama.cpp source files (explicit list, no glob)
    # ------------------------------------------------------------------
    # All 100+ model architectures live under src/models/. Each defines
    # a derived llama_model_X class; missing one breaks the vtable link.
    # We use a glob here (no CONFIGURE_DEPENDS needed since the source
    # tree is stable on disk after the initial vendor step).
    file(GLOB LLAMA_MODEL_SOURCES
        "${LLAMA_CPP_DIR}/src/models/*.cpp"
    )

    set(LLAMA_SOURCES
        ${LLAMA_CPP_DIR}/src/llama-adapter.cpp
        ${LLAMA_CPP_DIR}/src/llama-arch.cpp
        ${LLAMA_CPP_DIR}/src/llama-batch.cpp
        ${LLAMA_CPP_DIR}/src/llama-chat.cpp
        ${LLAMA_CPP_DIR}/src/llama-context.cpp
        ${LLAMA_CPP_DIR}/src/llama-cparams.cpp
        ${LLAMA_CPP_DIR}/src/llama-grammar.cpp
        ${LLAMA_CPP_DIR}/src/llama-graph.cpp
        ${LLAMA_CPP_DIR}/src/llama-hparams.cpp
        ${LLAMA_CPP_DIR}/src/llama-impl.cpp
        ${LLAMA_CPP_DIR}/src/llama-io.cpp
        ${LLAMA_CPP_DIR}/src/llama-kv-cache-dsa.cpp
        ${LLAMA_CPP_DIR}/src/llama-kv-cache-iswa.cpp
        ${LLAMA_CPP_DIR}/src/llama-kv-cache.cpp
        ${LLAMA_CPP_DIR}/src/llama-memory-hybrid-iswa.cpp
        ${LLAMA_CPP_DIR}/src/llama-memory-hybrid.cpp
        ${LLAMA_CPP_DIR}/src/llama-memory-recurrent.cpp
        ${LLAMA_CPP_DIR}/src/llama-memory.cpp
        ${LLAMA_CPP_DIR}/src/llama-mmap.cpp
        ${LLAMA_CPP_DIR}/src/llama-model-loader.cpp
        ${LLAMA_CPP_DIR}/src/llama-model-saver.cpp
        ${LLAMA_CPP_DIR}/src/llama-model.cpp
        ${LLAMA_CPP_DIR}/src/llama-quant.cpp
        ${LLAMA_CPP_DIR}/src/llama-sampler.cpp
        ${LLAMA_CPP_DIR}/src/llama-vocab.cpp
        ${LLAMA_CPP_DIR}/src/llama.cpp
        # Tokenizer unicode tables + helpers (referenced by llama-vocab.cpp).
        ${LLAMA_CPP_DIR}/src/unicode.cpp
        ${LLAMA_CPP_DIR}/src/unicode-data.cpp
        # All model architectures — must all be linked so the vtables
        # resolve. llama.cpp uses a self-registration pattern.
        ${LLAMA_MODEL_SOURCES}
    )

    # ------------------------------------------------------------------
    # ggml C sources (the core tensor library — needs C compiler)
    # ------------------------------------------------------------------
    set(GGML_C_SOURCES
        ${LLAMA_CPP_DIR}/ggml/src/ggml.c
        ${LLAMA_CPP_DIR}/ggml/src/ggml-alloc.c
        ${LLAMA_CPP_DIR}/ggml/src/ggml-quants.c
    )

    # ------------------------------------------------------------------
    # ggml C++ sources (backend + threading + gguf)
    # ------------------------------------------------------------------
    set(GGML_CPP_SOURCES
        ${LLAMA_CPP_DIR}/ggml/src/ggml-backend.cpp
        ${LLAMA_CPP_DIR}/ggml/src/ggml-backend-dl.cpp
        ${LLAMA_CPP_DIR}/ggml/src/ggml-backend-meta.cpp
        ${LLAMA_CPP_DIR}/ggml/src/ggml-backend-reg.cpp
        ${LLAMA_CPP_DIR}/ggml/src/ggml-opt.cpp
        ${LLAMA_CPP_DIR}/ggml/src/ggml-threading.cpp
        ${LLAMA_CPP_DIR}/ggml/src/ggml.cpp
        ${LLAMA_CPP_DIR}/ggml/src/gguf.cpp
    )

    target_sources(pulse_llm PRIVATE
        ${LLAMA_SOURCES}
        ${GGML_C_SOURCES}
        ${GGML_CPP_SOURCES}
    )

    # ggml's CPU backend is opt-in: define the specific SIMD level per ABI.
    if(CMAKE_ANDROID_ARCH_ABI STREQUAL "arm64-v8a")
        target_compile_definitions(pulse_llm PRIVATE GGML_CPU_ARM_ARCH=8)
    elseif(CMAKE_ANDROID_ARCH_ABI STREQUAL "armeabi-v7a")
        target_compile_definitions(pulse_llm PRIVATE GGML_CPU_ARM_ARCH=7)
    elseif(CMAKE_ANDROID_ARCH_ABI STREQUAL "x86_64")
        # x86_64 uses AVX/AVX2 by default; no extra define needed.
    endif()
endif()
