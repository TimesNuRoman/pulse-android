# Pulse native libraries — CMakeLists
#
# Builds TWO shared libraries:
#   1. `pulse_llm`   — Kotlin LlamaEngine.kt, real llama.cpp b9442
#   2. `pulse_whisper` — Kotlin WhisperNative.kt, real whisper.cpp v1.8.4
#
# Each library has its own private copy of ggml with different APIs
# (llama.cpp's ggml 0.9.4 vs whisper.cpp's ggml 0.10+). Putting them
# in separate .so files avoids symbol collisions in the dynamic linker.
#
# We list source files explicitly (no GLOB) to avoid the CONFIGURE_DEPENDS
# re-configure loop that AGP 8.x can hit on incremental builds.
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

# ==============================================================================
# pulse_whisper — real whisper.cpp v1.8.4
# ==============================================================================
# Kotlin side loads via `System.loadLibrary("pulse_whisper")` from
# com.pulse.android.data.voice.WhisperNative.
#
# whisper.cpp brings its own private ggml (newer than llama.cpp's); we
# build it as a private object library so it doesn't conflict with
# pulse_llm's ggml. Source list is explicit (no GLOB) for AGP stability.

set(WHISPER_DIR "${CMAKE_CURRENT_SOURCE_DIR}/whisper.cpp")
set(WHISPER_NATIVE_BRIDGE "whisper-jni.cpp")

# Build whisper.cpp + its bundled ggml as private OBJECT libraries so
# they end up linked into pulse_whisper.so (not as a separate shared lib).
add_library(whisper_core OBJECT
    ${WHISPER_DIR}/src/whisper.cpp
)

add_library(whisper_ggml_core OBJECT
    # ggml core (C sources, must compile with C compiler)
    # ggml-quants.c provides the legacy quantize_q*_impl functions
    # (quantize_q4_0, quantize_mxfp4, iq2xs_init_impl, etc.) that ggml.c
    # calls directly. The arch-specific quants in ggml-cpu/arch/*/quants.c
    # are gated by ABI below to avoid duplicate symbol collisions with
    # each other (both arch/arm/quants.c and arch/x86/quants.c define
    # ggml_vec_dot_q4_0_q8_0 etc. unconditionally).
    ${WHISPER_DIR}/ggml/src/ggml.c
    ${WHISPER_DIR}/ggml/src/ggml-alloc.c
    ${WHISPER_DIR}/ggml/src/ggml-quants.c
    # ggml core (C++ sources)
    ${WHISPER_DIR}/ggml/src/ggml-backend.cpp
    ${WHISPER_DIR}/ggml/src/ggml-backend-dl.cpp
    ${WHISPER_DIR}/ggml/src/ggml-backend-reg.cpp
    ${WHISPER_DIR}/ggml/src/ggml-threading.cpp
    ${WHISPER_DIR}/ggml/src/ggml.cpp
    ${WHISPER_DIR}/ggml/src/gguf.cpp
    ${WHISPER_DIR}/ggml/src/ggml-opt.cpp
)

add_library(whisper_ggml_cpu OBJECT
    # CPU backend - main
    ${WHISPER_DIR}/ggml/src/ggml-cpu/ggml-cpu.c
    ${WHISPER_DIR}/ggml/src/ggml-cpu/ggml-cpu.cpp
    ${WHISPER_DIR}/ggml/src/ggml-cpu/quants.c
    ${WHISPER_DIR}/ggml/src/ggml-cpu/repack.cpp
    ${WHISPER_DIR}/ggml/src/ggml-cpu/traits.cpp
    ${WHISPER_DIR}/ggml/src/ggml-cpu/binary-ops.cpp
    ${WHISPER_DIR}/ggml/src/ggml-cpu/unary-ops.cpp
    ${WHISPER_DIR}/ggml/src/ggml-cpu/vec.cpp
    ${WHISPER_DIR}/ggml/src/ggml-cpu/ops.cpp
    # hbm (high-bandwidth memory) - we don't need it on phones but
    # it's harmless to compile (only used if GGML_USE_CPU_HBM is defined)
    ${WHISPER_DIR}/ggml/src/ggml-cpu/hbm.cpp
    # Note: we skip amx/, llamafile/, kleidiai/ — these are server-only
    # and bloat the .so on phones. They are gated by feature defines
    # (GGML_USE_AMX, GGML_USE_LLAMAFILE) that we don't set.
)

# Arch-specific sources. We gate by ABI because arch/arm/quants.c and
# arch/x86/quants.c both define the same symbols (e.g. ggml_vec_dot_q4_0_q8_0)
# unconditionally — including both in the same .so causes ld.lld
# "duplicate symbol" errors. Each ABI gets exactly one arch directory.
set(WHISPER_CPU_ARCH_SOURCES "")
if(CMAKE_ANDROID_ARCH_ABI STREQUAL "arm64-v8a" OR CMAKE_ANDROID_ARCH_ABI STREQUAL "armeabi-v7a")
    list(APPEND WHISPER_CPU_ARCH_SOURCES
        ${WHISPER_DIR}/ggml/src/ggml-cpu/arch/arm/quants.c
        ${WHISPER_DIR}/ggml/src/ggml-cpu/arch/arm/repack.cpp
        ${WHISPER_DIR}/ggml/src/ggml-cpu/arch/arm/cpu-feats.cpp
    )
elseif(CMAKE_ANDROID_ARCH_ABI STREQUAL "x86_64")
    list(APPEND WHISPER_CPU_ARCH_SOURCES
        ${WHISPER_DIR}/ggml/src/ggml-cpu/arch/x86/quants.c
        ${WHISPER_DIR}/ggml/src/ggml-cpu/arch/x86/repack.cpp
        ${WHISPER_DIR}/ggml/src/ggml-cpu/arch/x86/cpu-feats.cpp
    )
endif()

target_sources(whisper_ggml_cpu PRIVATE ${WHISPER_CPU_ARCH_SOURCES})

# Combine into the final pulse_whisper shared library that Kotlin loads.
add_library(pulse_whisper SHARED
    ${WHISPER_NATIVE_BRIDGE}
    $<TARGET_OBJECTS:whisper_core>
    $<TARGET_OBJECTS:whisper_ggml_core>
    $<TARGET_OBJECTS:whisper_ggml_cpu>
)

# whisper.cpp requires C11 for ggml.c and C++17 for whisper.cpp.
set_target_properties(whisper_ggml_core PROPERTIES C_STANDARD 11)
set_target_properties(whisper_ggml_cpu PROPERTIES C_STANDARD 11)
set_target_properties(pulse_whisper PROPERTIES
    CXX_STANDARD 17
    CXX_STANDARD_REQUIRED ON
    POSITION_INDEPENDENT_CODE ON
)

target_include_directories(pulse_whisper PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${WHISPER_DIR}/include
    ${WHISPER_DIR}/ggml/include
    ${WHISPER_DIR}/ggml/src           # for ggml-impl.h reached by ggml-cpu
    ${WHISPER_DIR}/src
)
target_include_directories(whisper_core PRIVATE
    ${WHISPER_DIR}/include
    ${WHISPER_DIR}/ggml/include
    ${WHISPER_DIR}/ggml/src
    ${WHISPER_DIR}/src
)
# whisper.cpp uses WHISPER_VERSION (in whisper_version()). The upstream
# CMake injects it via target_compile_definitions; we drive manually.
target_compile_definitions(whisper_core PRIVATE
    WHISPER_VERSION="1.8.4"
)
target_include_directories(whisper_ggml_core PRIVATE
    ${WHISPER_DIR}/ggml/include
    ${WHISPER_DIR}/ggml/src
)
# ggml.c uses GGML_VERSION + GGML_COMMIT (in ggml_version / ggml_commit).
# whisper.cpp's bundled ggml is 0.9.8 (see whisper.cpp/ggml/CMakeLists.txt).
target_compile_definitions(whisper_ggml_core PRIVATE
    GGML_VERSION="0.9.8"
    GGML_COMMIT="v1.8.4"
)
target_include_directories(whisper_ggml_cpu PRIVATE
    ${WHISPER_DIR}/ggml/include
    ${WHISPER_DIR}/ggml/src
    ${WHISPER_DIR}/ggml/src/ggml-cpu  # for ops.h, traits.h, etc. reached as "ggml-cpu/foo.h"
)

# whisper.cpp compile definitions. These are normally injected by the
# upstream CMake (version.cmake + add_compile_definitions), but since
# we drive the build manually we hardcode them. Only user-visible
# strings (ggml_print_system), runtime behavior is unaffected.
target_compile_definitions(pulse_whisper PRIVATE
    GGML_NATIVE=OFF
    GGML_OPENMP=OFF
    GGML_BACKEND_DL=OFF   # we don't expose runtime-loadable backends
    GGML_CPU_ALL_VARIANTS=OFF
    WHISPER_VERSION="1.8.4"
)

# Threads (for ggml-threading.cpp / std::thread on Android)
find_package(Threads REQUIRED)
target_link_libraries(pulse_whisper
    log
    android
    Threads::Threads
)

# ARM arch level: same as llama.cpp's pulse_llm.
if(CMAKE_ANDROID_ARCH_ABI STREQUAL "arm64-v8a")
    target_compile_definitions(pulse_whisper PRIVATE GGML_CPU_ARM_ARCH=8)
elseif(CMAKE_ANDROID_ARCH_ABI STREQUAL "armeabi-v7a")
    target_compile_definitions(pulse_whisper PRIVATE GGML_CPU_ARM_ARCH=7)
elseif(CMAKE_ANDROID_ARCH_ABI STREQUAL "x86_64")
    # x86_64 uses default arch detect (AVX/AVX2 via __attribute__).
endif()
