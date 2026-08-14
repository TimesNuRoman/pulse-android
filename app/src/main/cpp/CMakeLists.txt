# Pulse LLM — CMakeLists
#
# Builds the `pulse_llm` shared library that Pulse's Kotlin `LlamaEngine` loads.
# The default config produces a **stub** library that exposes the same JNI surface
# as the real backend, so the Android app builds, links, and runs end-to-end
# (with `isNativeReady == true` and a placeholder token stream).
#
# To wire in real llama.cpp:
#   1. Vendor the llama.cpp source tree under `app/src/main/cpp/llama.cpp/`
#      (or use FetchContent / add_subdirectory).
#   2. Add: `add_subdirectory(llama.cpp)`
#   3. Switch `STUB_MODE` off by removing the `#define PULSE_LLM_STUB 1` in
#      native-lib.cpp (or build with `-DPULSE_LLM_STUB=0`).
#   4. Re-link `pulse_llm` against the llama.cpp target.
#
# The ABI list (arm64-v8a, armeabi-v7a, x86_64) is set in app/build.gradle.kts.
cmake_minimum_required(VERSION 3.22.1)
project(pulse_llm CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

option(PULSE_LLM_STUB "Build the stub LLM (no real inference)" ON)

add_library(pulse_llm SHARED
    native-lib.cpp
)

target_include_directories(pulse_llm PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
)

target_link_libraries(pulse_llm
    log
    android
)

if(PULSE_LLM_STUB)
    target_compile_definitions(pulse_llm PRIVATE PULSE_LLM_STUB=1)
endif()
