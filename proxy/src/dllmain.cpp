#include "dllmain.hpp"
#include <filesystem>
#include <winrt/windows.storage.h>
#include <Json.hpp>
#include <format>
#include <print>
#include <iostream>
#include <filesystem>
#include <fstream>
#include <algorithm>
#include <cwctype>
namespace fs = std::filesystem;

typedef NTSTATUS(NTAPI* NtSuspendThreadPtr)(HANDLE ThreadHandle, PULONG PreviousSuspendCount);
typedef NTSTATUS(NTAPI* NtResumeThreadPtr)(HANDLE ThreadHandle, PULONG PreviousSuspendCount);

// Define the Amethyst Init function signature
typedef void(__cdecl* RuntimeInitPtr)(DWORD dMcThreadID, HANDLE hMcThreadHandle);

HMODULE hClientModule = NULL;
HMODULE hProxyModule = NULL;
DWORD dMcThreadID = NULL;
HANDLE hMcThreadHandle = NULL;

NtSuspendThreadPtr NtSuspendThread = NULL; // NtSuspendThread function pointer
NtResumeThreadPtr NtResumeThread = NULL;   // NtResumeThread function pointer
RuntimeInitPtr RuntimeInit = NULL; // Amethyst Init function pointer

void SuspendMinecraftThread()
{
	NtSuspendThread(hMcThreadHandle, NULL);
}

void ResumeMinecraftThread()
{
    NtResumeThread(hMcThreadHandle, NULL);
}

void LoadNtdll() {
    HMODULE ntdllHandle = GetModuleHandle("ntdll.dll");
    if (ntdllHandle == 0) {
        std::println("[  proxy] [AmethystProxy] Could not get ntdll.dll");
        ShutdownWait();
        return;
    }

    FARPROC _NtSuspendThread = GetProcAddress(ntdllHandle, "NtSuspendThread");
    if (_NtSuspendThread == 0) {
        std::println("[  proxy] [AmethystProxy] Could not find ProcAddress of NtSuspendThread in ntdll.dll");
        ShutdownWait();
        return;
    }

    FARPROC _NtResumeThread = GetProcAddress(ntdllHandle, "NtResumeThread");
    if (_NtResumeThread == 0) {
        std::println("[  proxy] [AmethystProxy] Could not find ProcAddress of NtResumeThread in ntdll.dll");
        ShutdownWait();
        return;
    }

    NtSuspendThread = (NtSuspendThreadPtr)_NtSuspendThread;
    NtResumeThread = (NtResumeThreadPtr)_NtResumeThread;
}

HMODULE InjectIntoMinecraft(std::wstring& path)
{
    return LoadLibraryW(path.c_str());
}

FILE* fp;

const std::string red    = "\033[1;31m";
const std::string yellow = "\033[1;33m";
const std::string reset  = "\033[0m";

void InitializeConsole()
{
    // Initialize console with stdout/stderr
    AllocConsole();
    freopen_s(&fp, "CONOUT$", "w", stdout);
    freopen_s(&fp, "CONOUT$", "w", stderr);

    // Enable ANSI-Escape codes for colours
    HANDLE consoleHandle = GetStdHandle(STD_OUTPUT_HANDLE);
    DWORD consoleMode;

    GetConsoleMode(consoleHandle, &consoleMode);
    consoleMode |= ENABLE_VIRTUAL_TERMINAL_PROCESSING;
    SetConsoleMode(consoleHandle, consoleMode);
    SetConsoleTitle("AmethystAPI");
}

void DestroyConsole()
{
    fclose(fp);
    FreeConsole();
}

void HideConsole()
{
    // HWND consoleWindow = GetConsoleWindow();
    // ShowWindow(consoleWindow, SW_HIDE);
}

fs::path GetAppDataPath()
{
    char appdata[MAX_PATH];
    GetEnvironmentVariableA("APPDATA", appdata, MAX_PATH);
    return fs::path(appdata);
}

/** The build folder this proxy was loaded from, which is the game's install directory. */
fs::path GetProxyDirectory()
{
    wchar_t buffer[MAX_PATH];
    DWORD length = GetModuleFileNameW(hProxyModule, buffer, MAX_PATH);
    if (length == 0 || length == MAX_PATH) return {};
    return fs::path(buffer).parent_path();
}

bool SamePath(const fs::path& a, const fs::path& b)
{
    std::error_code ec;
    if (fs::equivalent(a, b, ec) && !ec) return true;

    auto normalise = [](const fs::path& p) {
        std::wstring s = p.lexically_normal().wstring();
        while (!s.empty() && (s.back() == L'\\' || s.back() == L'/')) s.pop_back();
        std::transform(s.begin(), s.end(), s.begin(), ::towlower);
        return s;
    };
    return normalise(a) == normalise(b);
}

/*
 * The launcher writes a session manifest into the profile's data folder immediately
 * before launch, and that folder is junctioned from its channel's roaming path. Both
 * channels are checked; the manifest whose version.path is this build is the live one,
 * which also proves it describes this process rather than the other game.
 */
bool ReadSessionManifest(nlohmann::json& out)
{
    const fs::path proxyDir = GetProxyDirectory();
    if (proxyDir.empty()) {
        std::println("{}[  proxy] [AmethystProxy] Could not resolve the proxy's own directory.{}", red, reset);
        return false;
    }

    for (const char* folder : { "Minecraft Bedrock", "Minecraft Bedrock Preview" }) {
        const fs::path manifestPath = GetAppDataPath() / folder / ".amethyst-session.json";

        std::ifstream file(manifestPath);
        if (!file.is_open()) continue;

        nlohmann::json manifest;
        try {
            file >> manifest;
        } catch (const std::exception& e) {
            std::println("{}[  proxy] [AmethystProxy] Could not parse {}: {}{}", red, manifestPath.string(), e.what(), reset);
            continue;
        }

        if (!manifest.contains("version") || !manifest["version"].is_object()) continue;
        if (!manifest["version"].contains("path") || !manifest["version"]["path"].is_string()) continue;

        if (SamePath(fs::path(manifest["version"]["path"].get<std::string>()), proxyDir)) {
            std::println("[  proxy] [AmethystProxy] Session: {}", manifestPath.string());
            out = std::move(manifest);
            return true;
        }
    }

    std::println("{}[  proxy] [AmethystProxy] No session manifest describes '{}'. Launch through Amethyst Launcher.{}",
                 red, proxyDir.string(), reset);
    return false;
}

void Proxy()
{
    InitializeConsole();

    // Resolve ntdll exports and freeze the MC main thread BEFORE doing any
    // file I/O. This collapses the race window where MC could run past a
    // hook target while we read config files. It is safe to suspend here:
    // we will not call LoadLibraryW until after we resume MC again, so we
    // cannot deadlock on the loader lock.
    LoadNtdll();
    SuspendMinecraftThread();

    nlohmann::json session;
    if (!ReadSessionManifest(session)) {
        ResumeMinecraftThread();
        return;
    }

    const int schema = session.value("schema", 0);
    if (schema != AMETHYST_SESSION_SCHEMA) {
        std::println("{}[  proxy] [AmethystProxy] Session schema {} is unsupported (this proxy speaks {}). Update the launcher or the proxy.{}",
                     red, schema, AMETHYST_SESSION_SCHEMA, reset);
        ResumeMinecraftThread();
        return;
    }

    const std::string profileName = session.contains("profile") ? session["profile"].value("name", "?") : "?";

    // A vanilla profile carries no runtime, so there is nothing to inject.
    if (!session.contains("runtime") || session["runtime"].is_null()) {
        std::println("[  proxy] [AmethystProxy] Profile '{}' is vanilla, no runtime DLL will be injected.", profileName);
        HideConsole();
        ResumeMinecraftThread();
        return;
    }

    const std::string runtimeName = session["runtime"].value("id", "");
    const std::string runtimeRoot = session["runtime"].value("path", "");
    if (runtimeName.empty() || runtimeRoot.empty()) {
        std::println("{}[  proxy] [AmethystProxy] Session manifest has an incomplete runtime entry.{}", red, reset);
        ResumeMinecraftThread();
        return;
    }

    const std::size_t at = runtimeName.find('@');
    if (at == std::string::npos) {
        std::println("{}[  proxy] [AmethystProxy] '{}' is not a valid runtime name, no version found.{}", red, runtimeName, reset);
        ResumeMinecraftThread();
        return;
    }

    const fs::path runtimeDll = fs::path(runtimeRoot) / "win-client" / (runtimeName.substr(0, at) + ".dll");
    if (!fs::exists(runtimeDll)) {
        std::println("{}[  proxy] [AmethystProxy] Runtime DLL not found at '{}'{}", red, runtimeDll.string(), reset);
        ResumeMinecraftThread();
        ShutdownWait();
        return;
    }

    std::println("[  proxy] [AmethystProxy] Using 'AmethystProxy@{}'", PROXY_VERSION);
    std::println("[  proxy] [AmethystProxy] McThreadID: {}, McThreadHandle: {}", dMcThreadID, hMcThreadHandle);
    std::println("[  proxy] [AmethystProxy] Injecting runtime '{}'", runtimeName);

    // Briefly resume MC so we can call LoadLibraryW without deadlocking on
    // the loader lock — if MC were suspended while holding it, our load
    // would block forever. This is the only window where MC runs free, and
    // it is kept as small as possible.
    std::wstring widePath = runtimeDll.wstring();
    ResumeMinecraftThread();
    HMODULE runtimeHandle = InjectIntoMinecraft(widePath);
    SuspendMinecraftThread();

    if (runtimeHandle == NULL) {
        std::println("{}[  proxy] [AmethystProxy] Could not get handle to injected runtime {}{}", red, runtimeName, reset);
        ResumeMinecraftThread();
        return ShutdownWait();
    }

    FARPROC _RuntimeInit = GetProcAddress(runtimeHandle, "Init");
    if (_RuntimeInit == NULL) {
        std::println("{}[  proxy] [AmethystProxy] The proxy expects function 'void Init(DWORD dMcThreadID, HANDLE hMcThreadHandle)' to be exported and was unable to find it.{}", red, reset);
        ResumeMinecraftThread();
        return ShutdownWait();
    }

    // MC is still suspended here. The runtime is responsible for resuming
    // the thread via hMcThreadHandle once it has finished patching.
    RuntimeInit = (RuntimeInitPtr)_RuntimeInit;
    RuntimeInit(dMcThreadID, hMcThreadHandle);
}

BOOL APIENTRY DllMain(HMODULE hModule, DWORD  ul_reason_for_call, LPVOID lpReserved)
{
    if (ul_reason_for_call == DLL_PROCESS_ATTACH) {
        hProxyModule = hModule;
        hClientModule = GetModuleHandle(NULL);
        // Create a seperate thread to do the proxying after caching the currentThreadID
        dMcThreadID = GetCurrentThreadId();
        hMcThreadHandle = OpenThread(THREAD_ALL_ACCESS, FALSE, dMcThreadID);

        // Create a thread to do the proxying
        CreateThread(NULL, NULL, (LPTHREAD_START_ROUTINE)Proxy, NULL, NULL, NULL);
    }

    return TRUE;
}

DWORD __stdcall EjectThread(LPVOID lpParameter)
{
    ExitProcess(0);
}

void Shutdown()
{
    DestroyConsole();
    CreateThread(0, 0, EjectThread, 0, 0, 0);
}

void ShutdownWait()
{
    std::println("Press Numpad0 to close...");

    while (1) {
        Sleep(10);
        if (GetAsyncKeyState(VK_NUMPAD0)) break;
    }

    Shutdown();
}