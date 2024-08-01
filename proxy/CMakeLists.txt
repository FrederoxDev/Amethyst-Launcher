cmake_minimum_required(VERSION 3.12)
project(AmethystProxy CXX ASM_NASM)
set(CMAKE_CXX_STANDARD 23)

set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} /await")

file(GLOB_RECURSE ProxyAll
    "source/*.cpp" 
    "source/*.hpp"   
)
set(CMAKE_CONFIGURATION_TYPES "Release;RelWithDebInfo" CACHE STRING "" FORCE)
add_library(AmethystProxy SHARED ${ProxyAll})

target_include_directories(AmethystProxy PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/source
)

set(CMAKE_DISABLE_PRECOMPILE_HEADERS ON CACHE BOOL "")
if (MSVC)
    target_compile_definitions(AmethystProxy PUBLIC UNICODE _UNICODE)
endif() 

target_link_libraries(AmethystProxy PRIVATE 
    AmethystAPI
    $ENV{amethyst_src}/AmethystAPI/lib/fmt.lib
)

set_target_properties(AmethystProxy PROPERTIES OUTPUT_NAME "dxgi")
set_target_properties(AmethystProxy PROPERTIES SUFFIX ".dll")

# Get the AmethystAPI Lib.
add_subdirectory("$ENV{amethyst_src}/AmethystAPI" "build") 
source_group(TREE "${CMAKE_CURRENT_SOURCE_DIR}/source" FILES ${ProxyAll}) 