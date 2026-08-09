import { log } from "@renderer/scripts/LauncherLog";
import { describeResult, psQuote, readMarker, runPowerShell } from "@shared/diagnostics/ProcessRunner";
import { ACTIVATION_SUCCESS_HRESULT, describeHresult, normaliseHresult } from "./LaunchDiagnostics";

const { Buffer } = window.require("buffer") as typeof import("buffer");

const ACTIVATION_TIMEOUT_MS = 30_000;
const EVENT_QUERY_TIMEOUT_MS = 25_000;

/**
 * The channels Windows writes an activation's own account of itself to. AppModel-Runtime/Admin
 * is the one that names the process it created, or does not, which is the difference between
 * "the game started and died" and "the game was never started".
 */
const EVENT_CHANNELS = [
    "Microsoft-Windows-AppModel-Runtime/Admin",
    "Microsoft-Windows-AppReadiness/Admin",
    "Microsoft-Windows-TWinUI/Operational",
    "Microsoft-Windows-AppXDeploymentServer/Operational",
];

export interface ActivationOutcome {
    /** Windows both accepted the request and reported a process for it. */
    ok: boolean;
    /** `0x00000000` on success, or `""` when the call itself never got far enough to return one. */
    hresult: string;
    /** The process Windows says it created. `0` when it created none. */
    pid: number;
    /** Everything worth logging about the attempt, already formatted. */
    detail: string;
}

/**
 * Declared here rather than P/Invoked, because the vtable order is what makes the call land on
 * ActivateApplication; the other two methods exist only to hold their slots. `PreserveSig` keeps
 * the HRESULT as a return value, so a refusal is a code to read rather than an exception to
 * re-derive. Its own STA thread because COM activation requires an apartment and a host that
 * happened to start MTA would otherwise fail for a reason that has nothing to do with the game.
 */
const ACTIVATION_SOURCE = `
using System;
using System.Runtime.InteropServices;
using System.Threading;

namespace AmethystActivation {

[ComImport, Guid("2e941141-7f97-4756-ba1d-9decde894a3d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IApplicationActivationManager {
    [PreserveSig] int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)] string appUserModelId, [MarshalAs(UnmanagedType.LPWStr)] string arguments, uint options, out uint processId);
    [PreserveSig] int ActivateForFile([MarshalAs(UnmanagedType.LPWStr)] string appUserModelId, IntPtr itemArray, [MarshalAs(UnmanagedType.LPWStr)] string verb, out uint processId);
    [PreserveSig] int ActivateForProtocol([MarshalAs(UnmanagedType.LPWStr)] string appUserModelId, IntPtr itemArray, out uint processId);
}

[ComImport, Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")]
public class ApplicationActivationManagerClass { }

public static class GameLauncher {
    public static int Hr;
    public static uint Pid;
    public static string Failure = "";

    static void Work(string aumid) {
        try {
            IApplicationActivationManager manager = (IApplicationActivationManager)new ApplicationActivationManagerClass();
            uint created = 0;
            Hr = manager.ActivateApplication(aumid, "", 0, out created);
            Pid = created;
        }
        catch (Exception e) {
            Hr = Marshal.GetHRForException(e);
            Failure = e.GetType().Name + ": " + e.Message.Replace((char)13, ' ').Replace((char)10, ' ');
        }
    }

    public static void Run(string aumid) {
        Thread thread = new Thread(delegate() { Work(aumid); });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();
    }
}

}
`;

/**
 * Asks Windows to start the app and to say what happened, which `explorer.exe shell:AppsFolder`
 * cannot: it hands the request off and exits 0 either way, so a refused activation and a
 * successful one are indistinguishable from the caller. This returns the HRESULT and the process
 * id Windows created, so "nothing happened" becomes a specific code.
 */
export async function activateByAumid(aumid: string): Promise<ActivationOutcome> {
    const source = Buffer.from(ACTIVATION_SOURCE, "utf-8").toString("base64");
    log("Activation", `Calling ActivateApplication for ${aumid}, giving it ${ACTIVATION_TIMEOUT_MS / 1000}s to answer`);

    const result = await runPowerShell(
        `$source = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${source}'))\n`
        + `Add-Type -TypeDefinition $source -Language CSharp\n`
        + `[AmethystActivation.GameLauncher]::Run('${psQuote(aumid)}')\n`
        + `Write-Output ('ACTIVATE_HRESULT=0x{0:X8}' -f [AmethystActivation.GameLauncher]::Hr)\n`
        + `Write-Output ('ACTIVATE_PID=' + [AmethystActivation.GameLauncher]::Pid)\n`
        + `Write-Output ('ACTIVATE_FAILURE=' + [AmethystActivation.GameLauncher]::Failure)\n`
        + `Write-Output 'ACTIVATE_STATE=ok'`,
        { timeoutMs: ACTIVATION_TIMEOUT_MS }
    );

    const hresult = normaliseHresult(readMarker(result.output, "ACTIVATE_HRESULT"));
    const pid = parseInt(readMarker(result.output, "ACTIVATE_PID") ?? "", 10);
    const failure = readMarker(result.output, "ACTIVATE_FAILURE") ?? "";
    const reached = readMarker(result.output, "ACTIVATE_STATE") === "ok";

    if (!reached) {
        const detail = `Windows could not be asked to start the app.\n${describeResult(result)}`;
        log("Activation", `ActivateApplication for ${aumid} never ran to completion\n${detail}`);
        return { ok: false, hresult, pid: 0, detail };
    }

    const ok = hresult === ACTIVATION_SUCCESS_HRESULT && Number.isFinite(pid) && pid > 0;
    const detail =
        `ActivateApplication ${aumid}\n`
        + `  HRESULT ${hresult} (${describeHresult(hresult)})\n`
        + `  process id ${Number.isFinite(pid) ? pid : "unreadable"}`
        + (failure ? `\n  ${failure}` : "");

    log(
        "Activation",
        `ActivateApplication ${aumid} returned HRESULT ${hresult} (${describeHresult(hresult)}), `
        + `process id ${Number.isFinite(pid) ? pid : "unreadable"}, in ${result.durationMs}ms`
        + (failure ? `, ${failure}` : "")
    );

    return { ok, hresult, pid: Number.isFinite(pid) ? pid : 0, detail };
}

/**
 * What Windows wrote about the launch in its own logs. Usually the only place an activation
 * that produced nothing visible says why, and no user can be asked to go and read it.
 */
export async function recentAppModelEvents(sinceSeconds: number): Promise<string> {
    const channels = EVENT_CHANNELS.map(c => `'${psQuote(c)}'`).join(", ");

    const result = await runPowerShell(
        `$since = (Get-Date).AddSeconds(-${Math.round(sinceSeconds)})\n`
        + `foreach ($channel in @(${channels})) {\n`
        + `    try {\n`
        + `        $found = Get-WinEvent -FilterHashtable @{ LogName = $channel; StartTime = $since } -MaxEvents 12 -ErrorAction Stop\n`
        + `    }\n`
        + `    catch { continue }\n`
        + `    foreach ($event in $found) {\n`
        + `        $text = ($event.Message -replace '\\r?\\n', ' ') -replace '\\s+', ' '\n`
        + `        if ($text.Length -gt 300) { $text = $text.Substring(0, 300) + '...' }\n`
        + `        Write-Output ('EVENT=' + $channel + ' | ' + $event.LevelDisplayName + ' | id ' + $event.Id + ' | ' + $text)\n`
        + `    }\n`
        + `}\n`
        + `Write-Output 'EVENTS=ok'`,
        { timeoutMs: EVENT_QUERY_TIMEOUT_MS }
    );

    if (readMarker(result.output, "EVENTS") !== "ok") {
        log("Activation", `Windows would not hand over its own event logs\n${describeResult(result)}`);
        return `Windows would not hand over its own logs.\n${describeResult(result)}`;
    }

    const lines = result.stdout
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.startsWith("EVENT="))
        .map(line => line.slice("EVENT=".length));

    return lines.length === 0 ? "nothing recorded in that window" : lines.join("\n");
}
