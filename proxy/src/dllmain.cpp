#include "dllmain.hpp"
#include <filesystem>
#include <winrt/Windows.Storage.h>
#include <Json.hpp>
#include <format>
#include <print>
namespace fs = std::filesystem;

#include <winrt/Windows.Storage.h>
#include <winrt/base.h>

using namespace winrt;
using namespace Windows::Storage;

typedef NTSTATUS(NTAPI* NtSuspendThreadPtr)(HANDLE ThreadHandle, PULONG PreviousSuspendCount);
typedef NTSTATUS(NTAPI* NtResumeThreadPtr)(HANDLE ThreadHandle, PULONG PreviousSuspendCount);

// Define the Amethyst Init function signature
typedef void(__cdecl* RuntimeInitPtr)(DWORD dMcThreadID, HANDLE hMcThreadHandle);

HMODULE hClientModule = NULL;
DWORD dMcThreadID = NULL;
HANDLE hMcThreadHandle = NULL;

NtSuspendThreadPtr NtSuspendThread = NULL; // NtSuspendThread function pointer
RuntimeInitPtr RuntimeInit = NULL; // Amethyst Init function pointer

void SuspendMinecraftThread()
{
	NtSuspendThread(hMcThreadHandle, NULL);
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

    NtSuspendThread = (NtSuspendThreadPtr)_NtSuspendThread;
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
    // Enable utf8 io
    SetConsoleOutputCP(CP_UTF8);
    SetConsoleCP(CP_UTF8);
}

void DestroyConsole()
{
    fclose(fp);
    FreeConsole();
}

void HideConsole()
{
    HWND consoleWindow = GetConsoleWindow();
    ShowWindow(consoleWindow, SW_HIDE);
}

fs::path GetComMojangPath()
{
    StorageFolder localFolder = ApplicationData::Current().LocalFolder();
    fs::path localPath = localFolder.Path().c_str();
    return localPath / "games" / "com.mojang";
}

void Proxy()
{
    InitializeConsole();

    fs::path launcherConfigPath = GetComMojangPath() / "amethyst" / "launcher_config.json";

    std::ifstream launcherFile = std::ifstream(launcherConfigPath);
    if (!launcherFile.is_open()) {
        std::cerr << red << "[Amethyst-Loader] Could not open " << launcherConfigPath << "\n" << reset;
        return;
    }

    nlohmann::json launcherConfig;
    try {
        launcherFile >> launcherConfig;
    } catch (const std::exception& e) {
        std::cerr << red << "[Amethyst-Loader] Failed to parse amethyst/launcher_config.json: " << e.what() << "\n" << reset;
        return;
    }

    std::string runtimeName;

    if (launcherConfig.contains("runtime")) {
        runtimeName = launcherConfig["runtime"];
    } else {
        std::cerr << red << "Key 'runtime' not found in the JSON file." << std::endl << reset;
        return;
    }

    // Handle vanilla profiles
    if (runtimeName == "Vanilla") {
        HideConsole();
        return;
    }

    std::size_t pos = runtimeName.find('@');
    std::string dllName;

    if (pos != std::string::npos) {
        dllName = runtimeName.substr(0, pos);
    } else {
        std::cerr << red << std::format("{} is not a valid runtime name, no versioning found!", runtimeName) << std::endl << reset;
    }

    fs::path runtimeDll = GetComMojangPath() / "amethyst" / "mods" / runtimeName / "win-client" / (dllName + ".dll");

    if (!fs::exists(runtimeDll)) {
        fs::path modernPath = runtimeDll;
        runtimeDll = GetComMojangPath() / "amethyst" / "mods" / runtimeName / (dllName + ".dll");

        if (!fs::exists(runtimeDll)) {
            std::println("{}[  proxy] [AmethystProxy] Runtime DLL not found in '{}' or legacy path'{}'{}", red, modernPath.string(), runtimeDll.string(), reset);
            ShutdownWait();
            return;
        }
        else {
            std::println("{}[  proxy] [AmethystProxy] Runtime '{}' uses legacy file paths! New mods should use 'mod/win-client/*.dll' over 'mod/*.dll'{}", yellow, runtimeName, reset);
        }
    }

    // std::println("[  proxy] [AmethystProxy] Loading runtime DLL from path: {}", runtimeDll.string());
    std::println("[  proxy] [AmethystProxy] Using 'AmethystProxy@{}'", PROXY_VERSION);
    std::println("[  proxy] [AmethystProxy] McThreadID: {}, McThreadHandle: {}", dMcThreadID, hMcThreadHandle);

    // Load ntdll.dll and use it to suspend minecraft to allow the runtime to take control.
    LoadNtdll();
    SuspendMinecraftThread();

    std::println("[  proxy] [AmethystProxy] Injecting runtime '{}'", runtimeName);

    std::wstring widePath = runtimeDll.wstring();
    HMODULE runtimeHandle = InjectIntoMinecraft(widePath);

    if (runtimeHandle == NULL) {
        std::println("{}[  proxy] [AmethystProxy] Could not get handle to injected runtime {}{}", red, runtimeName, reset);
        return ShutdownWait();
    }

    FARPROC _RuntimeInit = GetProcAddress(runtimeHandle, "Init");
    if (_RuntimeInit == NULL) {
        std::println("{}[  proxy] [AmethystProxy] The proxy expects function 'void Init(DWORD dMcThreadID, HANDLE hMcThreadHandle)' to be exported and was unable to find it.{}", red, reset);
        return ShutdownWait();
    }

    RuntimeInit = (RuntimeInitPtr)_RuntimeInit;
    RuntimeInit(dMcThreadID, hMcThreadHandle);
}

BOOL APIENTRY DllMain(HMODULE hModule, DWORD  ul_reason_for_call, LPVOID lpReserved)
{
    if (ul_reason_for_call == DLL_PROCESS_ATTACH) {
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