#include "dllmain.hpp"
#include <filesystem>
#include <winrt/Windows.Storage.h>
#include <amethyst/Utility.hpp>
#include "AmethystProxy.hpp"

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
}

HMODULE InjectIntoMinecraft(std::wstring& path)
{
    return LoadLibraryW(path.c_str());
}

void Proxy()
{
    Log::InitializeConsole();

    Log::Info("[AmethystProxy] Using 'AmethystProxy@{}'", PROXY_VERSION);
    Log::Info("[AmethystProxy] McThreadID: {}, McThreadHandle: {}", dMcThreadID, hMcThreadHandle);

    AmethystProxy proxy;
    bool loadedConfig = proxy.LoadLauncherConfig();
    if (!loadedConfig) return ShutdownWait();

    std::string runtimeName = proxy.mConfig->injectedMod;

    // Handle vanilla profiles
    if (runtimeName == "Vanilla") {
        Log::HideConsole();
        return;
    }

    // Load ntdll.dll and use it to suspend minecraft to allow the runtime to take control.
    LoadNtdll();
    SuspendMinecraftThread();

    fs::path runtimePath;
    bool foundRuntimePath = proxy.GetRuntimePath(runtimePath);
    if (!foundRuntimePath) return ShutdownWait();

    Log::Info("[AmethystProxy] Injecting runtime '{}'", runtimeName);

    std::wstring widePath = runtimePath.wstring();
    HMODULE runtimeHandle = InjectIntoMinecraft(widePath);

    if (runtimeHandle == NULL) {
        Log::Error("[AmethystProxy] Could not get handle to injected runtime {}", runtimeName);
        return ShutdownWait();
    }

    FARPROC _RuntimeInit = GetProcAddress(runtimeHandle, "Init");
    if (_RuntimeInit == NULL) {
        Log::Error("[AmethystProxy] The proxy expects function 'void Init(DWORD dMcThreadID, HANDLE hMcThreadHandle)' to be exported and was unable to find it.");
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