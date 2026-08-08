import { log } from "@renderer/scripts/LauncherLog";
import { describeResult, psQuote, readMarker, runPowerShell } from "@shared/diagnostics/ProcessRunner";

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

/**
 * FACILITY_SHELL activation results, plus the general codes seen in practice. Only codes with
 * a documented symbolic name are here; anything else is reported raw rather than guessed at.
 */
const HRESULT_MEANINGS: Record<string, string> = {
    "0x80004005": "E_FAIL, Windows gave no reason",
    "0x80040154": "REGDB_E_CLASSNOTREG, the Windows component that starts apps is not registered",
    "0x80070002": "ERROR_FILE_NOT_FOUND, Windows could not find part of the app",
    "0x80070005": "E_ACCESSDENIED, Windows refused permission to start the app",
    "0x80070057": "E_INVALIDARG, Windows did not accept the app id, so it resolved to nothing",
    "0x80070522": "ERROR_PRIVILEGE_NOT_HELD, this account is not allowed to start the app",
    "0x80270251": "E_ELEVATED_ACTIVATION_NOT_SUPPORTED, apps cannot be started from a program running as administrator",
    "0x80270252": "E_UAC_DISABLED, User Account Control is off and Windows will not start packaged apps without it",
    "0x80270253": "E_FULL_ADMIN_NOT_SUPPORTED, the built-in Administrator account cannot run packaged apps",
    "0x80270254": "E_APPLICATION_NOT_REGISTERED, Windows has no record of this app for this user",
    "0x80270255": "E_MULTIPLE_EXTENSIONS_FOR_APPLICATION, the app id matches more than one entry",
    "0x80270256": "E_MULTIPLE_PACKAGES_FOR_FAMILY, more than one package claims this family",
    "0x80270257": "E_APPLICATION_MANAGER_NOT_RUNNING, the Windows service that starts apps is not running",
    "0x8027025A": "E_APPLICATION_ACTIVATION_TIMED_OUT, the app took too long to start",
    "0x8027025B": "E_APPLICATION_ACTIVATION_EXEC_FAILURE, Windows could not start the app's program",
    "0x8027025C": "E_APPLICATION_TEMPORARY_LICENSE_ERROR, there is a problem with the app's licence",
    "0x8027025D": "E_APPLICATION_TRIAL_LICENSE_EXPIRED, the app's licence has expired",
};

export function describeHresult(hresult: string): string {
    return HRESULT_MEANINGS[hresult.toUpperCase().replace("0X", "0x")] ?? "no documented meaning for this code";
}

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

function formatHresult(raw: string | null): string {
    return raw ? raw.trim().toUpperCase().replace("0X", "0x") : "";
}

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

    const hresult = formatHresult(readMarker(result.output, "ACTIVATE_HRESULT"));
    const pid = parseInt(readMarker(result.output, "ACTIVATE_PID") ?? "", 10);
    const failure = readMarker(result.output, "ACTIVATE_FAILURE") ?? "";
    const reached = readMarker(result.output, "ACTIVATE_STATE") === "ok";

    if (!reached) {
        const detail = `Windows could not be asked to start the app.\n${describeResult(result)}`;
        log("Activation", `ActivateApplication for ${aumid} never ran to completion\n${detail}`);
        return { ok: false, hresult, pid: 0, detail };
    }

    const ok = hresult === "0x00000000" && Number.isFinite(pid) && pid > 0;
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
