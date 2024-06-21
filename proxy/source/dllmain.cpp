#include "dllmain.h"
#include <filesystem>
#include <winrt/Windows.Storage.h>
#include <amethyst/Utility.hpp>
namespace fs = std::filesystem;
using namespace winrt;
using namespace Windows::Storage;

// Define the NtSuspendThread function signature
typedef NTSTATUS(NTAPI* NtSuspendThreadPtr)(HANDLE ThreadHandle, PULONG PreviousSuspendCount);
// Define the NtResumeThread function signature
typedef NTSTATUS(NTAPI* NtResumeThreadPtr)(HANDLE ThreadHandle, PULONG PreviousSuspendCount);

// Define the Amethyst Init function signature
typedef void(__cdecl* RuntimeInitPtr)(DWORD dMcThreadID, HANDLE hMcThreadHandle);

// Remove this line if you aren't proxying any functions.
HMODULE hProxied = LoadLibrary(L"C:\\Windows\\System32\\dxgi.dll");
HMODULE hAmethyst = NULL;

HMODULE hClientModule = NULL;
DWORD dMcThreadID = NULL;
HANDLE hMcThreadHandle = NULL;

NtSuspendThreadPtr NtSuspendThread = NULL; // NtSuspendThread function pointer
NtResumeThreadPtr NtResumeThread = NULL; // NtResumeThread function pointer
RuntimeInitPtr RuntimeInit = NULL; // Amethyst Init function pointer

static Config loadConfig(const std::wstring& path)
{
    // Read the config file and make sure that if exists
    std::ifstream configStream(path);
    if (!configStream.good()) {
        std::wcout << "[AmethystProxy] Failed to open '" << path << "'" << std::endl;
        std::wcout << L"Error" << std::strerror(errno) << std::endl;
        ShutdownWait();
    }

    // Read the configs content and close the config file
    std::string rawConfigJson((std::istreambuf_iterator<char>(configStream)), std::istreambuf_iterator<char>());
    configStream.close();

    try {
        return Config(rawConfigJson);
    }
    catch (...) {
        Log::Error("[AmethystProxy] Failed to parse the config file");
        ShutdownWait();
    }
}

void SuspendMinecraftThread()
{
	NtSuspendThread(hMcThreadHandle, NULL);
}

void ResumeMinecraftThread()
{
    NtResumeThread(hMcThreadHandle, NULL);
}

static std::wstring FindRuntimeDllPath()
{
    fs::path minecraftFolder = GetMinecraftFolder();
    fs::path configPath = minecraftFolder / L"Amethyst" / L"Launcher" / L"launcher_config.json";

    Config config = loadConfig(configPath);
    std::string rawModName = config.injectedMod;

    // Launching a vanilla profile so exit
    if (rawModName == "Vanilla") return L"Vanilla";
    
    // Split the runtime mod name by the @ character to find the dllName
    size_t at = rawModName.find("@");
    if (at == std::string::npos) {
        Log::Error("[AmethystProxy] Invalid runtime name, no versioning: '{}'", rawModName);
        ShutdownWait();
    }

    // Mod name before the versioning
    std::string modName = rawModName.substr(0, at);
    std::wstring versionlessName(modName.begin(), modName.end());
    std::wstring versionedName(rawModName.begin(), rawModName.end());

    fs::path dllPath = minecraftFolder / L"Amethyst" / L"Mods" / versionedName / std::wstring(versionlessName + L".dll");
    return dllPath.generic_wstring();
}

static void InjectIntoMinecraft(std::wstring& path)
{
    LoadLibrary(path.c_str());
}

static void Proxy()
{
    /*if (path == L"Vanilla") {
        return;
    }*/

    Log::InitializeConsole();

    Log::Info("[AmethystProxy] Using 'AmethystProxy@{}'", PROXY_VERSION);
    Log::Info("[AmethystProxy] McThreadID: {}, McThreadHandle: {}", dMcThreadID, hMcThreadHandle);

    fs::path minecraftFolder = GetMinecraftFolder();
    fs::path configPath = minecraftFolder / L"Amethyst" / L"Launcher" / L"launcher_config.json";

    std::wcout << configPath.generic_wstring() << std::endl;

    //Log::Info(L"{}", roamingFolder.Path().c_str());
    //std::wcout << folder.get << std::endl;x

    ShutdownWait();
    return;

    /*return;

    HMODULE ntdllHandle = GetModuleHandle(L"ntdll.dll");
    if (ntdllHandle == 0) {
        Log::Error("[AmethystProxy] Could not get ntdll.dll");
        ShutdownWait();
        return;
    }

    FARPROC _NtSuspendThread = GetProcAddress(ntdllHandle, "NtSuspendThread");
    if (_NtSuspendThread == 0) {
        Log::Error("[AmethystProxy] Could not find ProcAddress of NtSuspendThread in ntdll.dll");
        ShutdownWait();
        return;
    }

    NtSuspendThread = (NtSuspendThreadPtr)_NtSuspendThread;

    FARPROC _NtResumeThread = GetProcAddress(ntdllHandle, "NtResumeThread");
    if (_NtResumeThread == 0) {
        Log::Error("[AmethystProxy] Could not find ProcAddress of NtResumeThread in ntdll.dll");
        ShutdownWait();
        return;
    }

    NtResumeThread = (NtResumeThreadPtr)_NtResumeThread;

    SuspendMinecraftThread();
    InjectIntoMinecraft(path);
    
    fs::path runtimeLibName = fs::path(path).filename();
    Log::Info("[AmethystProxy] Loading: {}", runtimeLibName.string());

    HMODULE runtimeHandle = GetModuleHandle(runtimeLibName.c_str());
    if (runtimeHandle == 0) {
        Log::Error("[AmethystProxy] Could not get {}", runtimeLibName.string());
        ShutdownWait();
        return;
    }

    FARPROC _RuntimeInit = GetProcAddress(runtimeHandle, "Init");
    if (runtimeHandle == 0) {
        Log::Error("[AmethystProxy] Could not find ProcAddress of Init in {}", runtimeLibName.string());
        ShutdownWait();
        return;
    }

    RuntimeInit = (RuntimeInitPtr)_RuntimeInit;
    RuntimeInit(dMcThreadID, hMcThreadHandle);*/
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
    Log::DestroyConsole();
    CreateThread(0, 0, EjectThread, 0, 0, 0);
}

void ShutdownWait()
{
    Log::Info("Press Numpad0 to close...");

    while (1) {
        Sleep(10);
        if (GetAsyncKeyState(VK_NUMPAD0)) break;
    }

    Shutdown();
}