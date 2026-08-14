#pragma once

#include <windows.h>
#include <cstdint>

#define PRELOAD_VERSION "1.0.0"

// Session manifest contract with the launcher (see scripts/session/Session.ts).
#define AMETHYST_SESSION_SCHEMA 1

/**
 * Contract with the runtime.
 *
 * Deliberately carries no thread handle. The old proxy handed the runtime a suspended main
 * thread and made it responsible for resuming it, which deadlocked whenever the runtime's own
 * loader work needed a lock that suspended thread was holding. Here nothing is ever suspended:
 * the runtime is called on the main thread itself, before the game's entry point has run.
 */
#define AMETHYST_PRELOAD_ABI 1

struct AmethystPreloadInfo {
    uint32_t abi;             // AMETHYST_PRELOAD_ABI, so a mismatched runtime can refuse
    const wchar_t* gameDir;   // the build folder this preload was loaded from
    const char* sessionJson;  // the raw session manifest, already read from disk
};

/** The runtime must export this, __cdecl, and return once it has finished patching. */
typedef void(__cdecl* AmethystRuntimeStartPtr)(const AmethystPreloadInfo* info);
#define AMETHYST_RUNTIME_START_EXPORT "AmethystRuntimeStart"
