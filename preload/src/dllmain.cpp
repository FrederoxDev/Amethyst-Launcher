/**
 * Gets the runtime into Minecraft before the game constructs anything, without suspending it.
 *
 * The game imports this DLL by name, so the loader maps it and runs DllMain during process
 * initialisation - before the executable's entry point, before the CRT, before a single static
 * constructor of the game. That is the earliest a mod loader can be given control.
 *
 * DllMain runs under the loader lock, where LoadLibrary and CreateThread are the two things
 * that must not happen. So DllMain does one thing: it redirects the game's entry point. The
 * loader then releases its lock and jumps to what it believes is the entry point, which lands
 * here instead - on the main thread, with the lock free and no game code executed yet. That is
 * where the runtime is loaded and where the real work is safe.
 */

#include "dllmain.hpp"

#include <Json.hpp>

#include <cstring>
#include <filesystem>
#include <fstream>
#include <string>

namespace fs = std::filesystem;

// FF 25 00 00 00 00 <8 byte target>: jmp qword ptr [rip+0], the only form that reaches
// anywhere in a 64-bit address space without needing a register.
constexpr SIZE_T HOOK_SIZE = 14;

static HMODULE gSelf = nullptr;
static BYTE* gEntryPoint = nullptr;
static BYTE gOriginalEntry[HOOK_SIZE] = {};
static bool gHookInstalled = false;

extern "C" __declspec(dllexport) void AmethystPreloadEntry() {}

static void Report(const char* message)
{
    OutputDebugStringA(message);
}

static fs::path SelfDirectory()
{
    wchar_t buffer[MAX_PATH];
    const DWORD length = GetModuleFileNameW(gSelf, buffer, MAX_PATH);
    if (length == 0 || length == MAX_PATH) return {};
    return fs::path(buffer).parent_path();
}

static fs::path AppDataDirectory()
{
    wchar_t buffer[MAX_PATH];
    const DWORD length = GetEnvironmentVariableW(L"APPDATA", buffer, MAX_PATH);
    if (length == 0 || length >= MAX_PATH) return {};
    return fs::path(buffer);
}

static bool SamePath(const fs::path& a, const fs::path& b)
{
    std::error_code ec;
    if (fs::equivalent(a, b, ec) && !ec) return true;

    const auto normalise = [](const fs::path& p) {
        std::wstring s = p.lexically_normal().wstring();
        while (!s.empty() && (s.back() == L'\\' || s.back() == L'/')) s.pop_back();
        for (auto& c : s) c = static_cast<wchar_t>(towlower(c));
        return s;
    };
    return normalise(a) == normalise(b);
}

/**
 * Both channels are checked and the manifest is matched against this build. A profile's data
 * folder is junctioned from its channel's roaming path, so the manifest whose version path is
 * the folder this DLL was loaded from is the one describing this process rather than the other
 * game.
 */
static bool ReadSession(const fs::path& gameDir, std::string& rawOut, nlohmann::json& parsedOut)
{
    const fs::path appData = AppDataDirectory();
    if (appData.empty()) return false;

    for (const wchar_t* folder : { L"Minecraft Bedrock", L"Minecraft Bedrock Preview" }) {
        const fs::path manifestPath = appData / folder / L".amethyst-session.json";

        std::ifstream file(manifestPath, std::ios::binary);
        if (!file.is_open()) continue;

        std::string raw((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());

        nlohmann::json manifest = nlohmann::json::parse(raw, nullptr, false);
        if (manifest.is_discarded()) continue;

        if (!manifest.contains("version") || !manifest["version"].is_object()) continue;
        const auto& version = manifest["version"];
        if (!version.contains("path") || !version["path"].is_string()) continue;

        if (!SamePath(fs::path(version["path"].get<std::string>()), gameDir)) continue;

        rawOut = std::move(raw);
        parsedOut = std::move(manifest);
        return true;
    }
    return false;
}

/** Absolute path, so the loader's search order never takes part in finding the runtime. */
static fs::path RuntimeDllPath(const nlohmann::json& session)
{
    if (!session.contains("runtime") || session["runtime"].is_null()) return {};
    const auto& runtime = session["runtime"];
    if (!runtime.is_object()) return {};

    const std::string id = runtime.value("id", "");
    const std::string root = runtime.value("path", "");
    if (id.empty() || root.empty()) return {};

    const std::size_t at = id.find('@');
    if (at == std::string::npos) return {};

    return fs::path(root) / L"win-client" / (id.substr(0, at) + ".dll");
}

static void StartRuntime()
{
    const fs::path gameDir = SelfDirectory();
    if (gameDir.empty()) {
        Report("[Amethyst-Preload] Could not resolve the build folder this DLL was loaded from.\n");
        return;
    }

    std::string raw;
    nlohmann::json session;
    if (!ReadSession(gameDir, raw, session)) {
        // Not an error: the game is allowed to be started outside the launcher, and a patched
        // build must still run vanilla when it is.
        Report("[Amethyst-Preload] No session manifest describes this build, starting vanilla.\n");
        return;
    }

    if (session.value("schema", 0) != AMETHYST_SESSION_SCHEMA) {
        Report("[Amethyst-Preload] Session manifest schema is not the one this preload speaks.\n");
        return;
    }

    const fs::path runtimeDll = RuntimeDllPath(session);
    if (runtimeDll.empty()) {
        Report("[Amethyst-Preload] Profile carries no runtime, starting vanilla.\n");
        return;
    }

    // The loader lock is free here, so this is an ordinary load rather than the reentrant one
    // that made the old proxy deadlock.
    const HMODULE runtime = LoadLibraryW(runtimeDll.c_str());
    if (runtime == nullptr) {
        Report("[Amethyst-Preload] The runtime DLL could not be loaded.\n");
        return;
    }

    const auto start = reinterpret_cast<AmethystRuntimeStartPtr>(
        GetProcAddress(runtime, AMETHYST_RUNTIME_START_EXPORT));
    if (start == nullptr) {
        Report("[Amethyst-Preload] The runtime does not export " AMETHYST_RUNTIME_START_EXPORT ".\n");
        return;
    }

    const std::wstring gameDirText = gameDir.wstring();
    const AmethystPreloadInfo info{ AMETHYST_PRELOAD_ABI, gameDirText.c_str(), raw.c_str() };
    start(&info);
}

static void RestoreEntryPoint()
{
    if (!gHookInstalled) return;

    DWORD previous = 0;
    if (VirtualProtect(gEntryPoint, HOOK_SIZE, PAGE_EXECUTE_READWRITE, &previous)) {
        std::memcpy(gEntryPoint, gOriginalEntry, HOOK_SIZE);
        VirtualProtect(gEntryPoint, HOOK_SIZE, previous, &previous);
        FlushInstructionCache(GetCurrentProcess(), gEntryPoint, HOOK_SIZE);
    }
    gHookInstalled = false;
}

/**
 * Where the loader lands instead of the game's entry point. The original bytes go back first
 * so the game runs unmodified even if the runtime throws, and the entry point is called rather
 * than jumped to only because a CRT entry point never returns.
 */
extern "C" __declspec(noinline) void AmethystEntryThunk()
{
    RestoreEntryPoint();

    __try {
        StartRuntime();
    }
    __except (EXCEPTION_EXECUTE_HANDLER) {
        Report("[Amethyst-Preload] The runtime raised an exception during startup, continuing vanilla.\n");
    }

    reinterpret_cast<void(*)()>(gEntryPoint)();
}

static BYTE* ResolveEntryPoint()
{
    auto* base = reinterpret_cast<BYTE*>(GetModuleHandleW(nullptr));
    if (base == nullptr) return nullptr;

    auto* dos = reinterpret_cast<IMAGE_DOS_HEADER*>(base);
    if (dos->e_magic != IMAGE_DOS_SIGNATURE) return nullptr;

    auto* nt = reinterpret_cast<IMAGE_NT_HEADERS64*>(base + dos->e_lfanew);
    if (nt->Signature != IMAGE_NT_SIGNATURE) return nullptr;
    if (nt->OptionalHeader.AddressOfEntryPoint == 0) return nullptr;

    return base + nt->OptionalHeader.AddressOfEntryPoint;
}

static void InstallEntryPointHook()
{
    gEntryPoint = ResolveEntryPoint();
    if (gEntryPoint == nullptr) {
        Report("[Amethyst-Preload] The game's entry point could not be resolved, starting vanilla.\n");
        return;
    }

    std::memcpy(gOriginalEntry, gEntryPoint, HOOK_SIZE);

    BYTE patch[HOOK_SIZE] = { 0xFF, 0x25, 0x00, 0x00, 0x00, 0x00 };
    void* target = reinterpret_cast<void*>(&AmethystEntryThunk);
    std::memcpy(patch + 6, &target, sizeof(target));

    DWORD previous = 0;
    if (!VirtualProtect(gEntryPoint, HOOK_SIZE, PAGE_EXECUTE_READWRITE, &previous)) {
        Report("[Amethyst-Preload] The game's entry point could not be made writable, starting vanilla.\n");
        return;
    }
    std::memcpy(gEntryPoint, patch, HOOK_SIZE);
    VirtualProtect(gEntryPoint, HOOK_SIZE, previous, &previous);
    FlushInstructionCache(GetCurrentProcess(), gEntryPoint, HOOK_SIZE);

    gHookInstalled = true;
}

BOOL APIENTRY DllMain(HMODULE module, DWORD reason, LPVOID)
{
    if (reason == DLL_PROCESS_ATTACH) {
        gSelf = module;
        DisableThreadLibraryCalls(module);
        // Nothing else. Every call below the hook install would be loader reentrancy.
        InstallEntryPointHook();
    }
    return TRUE;
}
