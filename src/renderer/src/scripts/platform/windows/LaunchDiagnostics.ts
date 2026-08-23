/**
 * Names what a launch attempt did and what the user should do about it.
 *
 * Pure on purpose: every input is a fact somebody else already gathered from Windows, so the
 * decision table can be exercised without a machine, a Minecraft install or an Electron host.
 * "Windows refused", "Windows started nothing" and "the game crashed on startup" need three
 * different actions from the user, so they are three different outcomes here rather than one
 * message that covers all of them and helps with none.
 */

export const ACTIVATION_SUCCESS_HRESULT = "0x00000000";

/**
 * FACILITY_SHELL activation results, plus the general codes seen in practice. Only codes with
 * a documented symbolic name are here; anything else is reported raw rather than guessed at.
 */
const HRESULT_MEANINGS: Record<string, string> = {
    "0x00000000": "S_OK, Windows accepted the request",
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

/** What a user can actually do about each refusal. The default is last, never a dead end. */
const HRESULT_NEXT_STEPS: Record<string, string> = {
    "0x80070005": "Close the launcher and open it again normally, without running it as administrator.",
    "0x80070522": "Close the launcher and open it again normally, without running it as administrator.",
    "0x80270251": "Close the launcher and open it again normally, without running it as administrator.",
    "0x80270253":
        "Sign in to Windows with your normal account instead of the built-in Administrator account, then press Play again.",
    "0x80270252":
        "Turn User Account Control back on in Windows security settings, restart the computer, then press Play again.",
    "0x80270254": "Press Play again. The launcher will set Minecraft up from scratch this time.",
    "0x80270256":
        "Press Play again. The launcher will clear the extra Minecraft registration and set this one up again.",
    "0x80270257": "Restart the computer, then press Play again.",
    "0x8027025C": "Open Minecraft from the Start menu once and sign in, then come back and press Play again.",
    "0x8027025D": "Open Minecraft from the Start menu once and sign in, then come back and press Play again.",
    "0x80070002": "Delete this Minecraft version in the launcher and download it again, then press Play.",
    "0x8027025B": "Check that antivirus software is not blocking Minecraft, then press Play again.",
};

const DEFAULT_HRESULT_NEXT_STEP =
    "Restart the computer and press Play again. If it still will not start, open Logs and send the log file.";

export function normaliseHresult(raw: string | null | undefined): string {
    return raw ? raw.trim().toUpperCase().replace("0X", "0x") : "";
}

export function describeHresult(hresult: string): string {
    return HRESULT_MEANINGS[normaliseHresult(hresult)] ?? "no documented meaning for this code";
}

export function nextStepForHresult(hresult: string): string {
    return HRESULT_NEXT_STEPS[normaliseHresult(hresult)] ?? DEFAULT_HRESULT_NEXT_STEP;
}

export type MachineReadinessKind = "ready" | "sideloading-blocked" | "developer-mode-off";

export interface MachineReadiness {
    kind: MachineReadinessKind;
    /** Short enough to head a dialog, and the title of the setup prompt when one is raised. */
    headline: string;
    explanation: string;
    nextStep: string;
    /** The route that needs no launcher and no permission prompt, for when the repair does not take. */
    manualStep: string;
}

/**
 * Windows only runs a package registered from a loose manifest while Developer Mode is on, and
 * it is checked when the game starts and not only when it is registered. A machine that had it
 * on last week and has it off today still holds the registration, so nothing else notices.
 */
export function classifyMachineReadiness(facts: {
    developerMode: boolean;
    sideloadingBlockedByPolicy: boolean;
}): MachineReadiness {
    if (facts.sideloadingBlockedByPolicy) {
        return {
            kind: "sideloading-blocked",
            headline: "This computer does not allow Minecraft to be set up.",
            explanation: "The block is set by whoever administers this computer, so the launcher cannot change it.",
            nextStep:
                "If this is a work or school computer, ask its administrator to allow app sideloading. " +
                "On your own computer, open Settings, then System, then For developers, and turn on Developer Mode.",
            manualStep:
                "Ask whoever administers this computer to allow app sideloading. On your own computer, open " +
                "Settings, then System, then For developers, turn on Developer Mode, restart the computer " +
                "and press Play again.",
        };
    }

    if (!facts.developerMode) {
        return {
            kind: "developer-mode-off",
            headline: "Windows needs a setting turned on",
            explanation:
                "Windows will not run this Minecraft until Developer Mode is on. The launcher can turn it on " +
                "for you, but Windows will ask for permission first.",
            nextStep:
                "Choose Yes when the Windows permission prompt appears and the launch carries on by itself. " +
                "You can also turn it on yourself in Settings, then System, then For developers.",
            manualStep:
                "Open Settings, then System, then For developers, and turn on Developer Mode yourself. " +
                "Then restart the computer and press Play again.",
        };
    }

    return { kind: "ready", headline: "", explanation: "", nextStep: "", manualStep: "" };
}

export type BuildIntegrityKind = "usable" | "folder-missing" | "files-missing";

export interface BuildIntegrity {
    kind: BuildIntegrityKind;
    headline: string;
    nextStep: string;
}

/**
 * A build folder that an interrupted extraction, a manual delete or an antivirus quarantine has
 * taken files out of. Nothing downstream reads the folder before Windows is asked to run it, so
 * without this the whole thing surfaces as an activation that quietly did nothing.
 */
export function classifyBuild(files: {
    folderExists: boolean;
    gameExecutable: boolean;
    manifest: boolean;
}): BuildIntegrity {
    if (!files.folderExists) {
        return {
            kind: "folder-missing",
            headline: "This profile's Minecraft version is not on this computer any more.",
            nextStep: "Open Versions, download this version again, then press Play.",
        };
    }

    if (!files.gameExecutable || !files.manifest) {
        const missing = [
            files.gameExecutable ? null : "the game itself",
            files.manifest ? null : "the file Windows needs to install it",
        ]
            .filter(Boolean)
            .join(" and ");

        return {
            kind: "files-missing",
            headline: `This Minecraft version is incomplete, so it cannot start. It is missing ${missing}.`,
            nextStep:
                "Delete this version in the launcher and download it again. If it keeps happening, antivirus " +
                "software is most likely removing files as they are written, so allow the launcher's folder in it.",
        };
    }

    return { kind: "usable", headline: "", nextStep: "" };
}

export type LaunchOutcomeKind =
    | "running"
    | "unverified"
    | "activation-refused"
    | "no-process-created"
    | "exited-immediately"
    | "foreign-process"
    | "other-build-running";

export interface ProcessSnapshot {
    pid: number;
    /** Full image path, or "" when Windows would not report one. */
    executablePath: string;
}

export interface LaunchFacts {
    /** The build folder this launch is for. */
    versionPath: string;
    /** What the activation manager returned, or "" when the call never got far enough to return. */
    hresult: string;
    /** The process id the activation manager reported creating. 0 when it reported none. */
    activationPid: number;
    /** Whether that process id was still alive when the launcher stopped waiting. */
    activationPidAlive: boolean;
    /** The shell was asked to start the game because the activation manager would not. */
    usedShellFallback: boolean;
    /** Why the shell could not even be started, or "" when it started or was never needed. */
    shellSpawnError: string;
    /** Live game processes Windows reported. */
    processes: ProcessSnapshot[];
    /** Windows would not say which processes are running, so the list means nothing. */
    probeFailed: boolean;
}

export interface LaunchVerdict {
    kind: LaunchOutcomeKind;
    /** True when the launch is to be treated as a success. */
    started: boolean;
    /** One line naming the outcome, for the log. */
    summary: string;
    /** What happened, in words a user reads. */
    headline: string;
    /** What to do next. Never empty, so no outcome is ever a dead end. */
    nextStep: string;
}

/** Case-insensitive, separator-insensitive path compare, without pulling in node's path module. */
export function normalisePath(value: string): string {
    return value
        .replace(/[\\/]+/g, "\\")
        .replace(/\\+$/, "")
        .toLowerCase();
}

export function parentPath(value: string): string {
    const normalised = normalisePath(value);
    const cut = normalised.lastIndexOf("\\");
    return cut <= 0 ? normalised : normalised.slice(0, cut);
}

/**
 * A process is this launch's game when it runs out of the build folder this launch prepared. An
 * unreadable image path counts as a match: Windows withholds it for processes at a different
 * integrity level, and refusing to count those made a running game report as no game at all.
 */
export function isOurGame(process: ProcessSnapshot, versionPath: string): boolean {
    if (process.executablePath === "") return true;
    return parentPath(process.executablePath) === normalisePath(versionPath);
}

function crashedOnStartup(pid: number): LaunchVerdict {
    return {
        kind: "exited-immediately",
        started: false,
        summary: `Windows started process ${pid} and it exited before the launcher saw a game`,
        headline: "Minecraft started and then closed itself straight away.",
        nextStep:
            "This is a crash in the game or in one of its mods, not a problem with Windows. Open Logs and " +
            "read the newest Minecraft log for the reason. If this profile uses mods, turn them off one at " +
            "a time in the profile editor to find which one crashes.",
    };
}

export function classifyLaunch(facts: LaunchFacts): LaunchVerdict {
    const ours = facts.probeFailed ? undefined : facts.processes.find(p => isOurGame(p, facts.versionPath));
    if (ours) {
        return {
            kind: "running",
            started: true,
            summary: `Minecraft is running as process ${ours.pid} from ${ours.executablePath || "an image path Windows would not report"}`,
            headline: "",
            nextStep: "",
        };
    }

    // Both ways of asking failed, and no process list can soften that, so it is decided before
    // the process list gets a say.
    if (facts.shellSpawnError !== "") {
        const asked =
            facts.hresult === ACTIVATION_SUCCESS_HRESULT
                ? `Windows accepted the activation (${facts.hresult}) but created no process`
                : `Windows refused the activation (${facts.hresult || "no result"})`;
        return {
            kind: "activation-refused",
            started: false,
            summary: `${asked} and the shell fallback could not be started: ${facts.shellSpawnError}`,
            headline: "Windows would not start Minecraft, and the second way of asking it failed too.",
            nextStep: DEFAULT_HRESULT_NEXT_STEP,
        };
    }

    // Asking a process whether it is still there needs no process list, so a game that Windows
    // named and that has since died is known even when Windows will not list anything. Calling
    // that unverified would report a success to somebody who has no game.
    if (facts.hresult === ACTIVATION_SUCCESS_HRESULT && facts.activationPid > 0 && !facts.activationPidAlive) {
        return crashedOnStartup(facts.activationPid);
    }

    // Not being able to look is not evidence that nothing started, and failing a launch over an
    // unanswered question leaves a user with a game on screen and an error banner over it.
    if (facts.probeFailed) {
        return {
            kind: "unverified",
            started: true,
            summary:
                "Windows would not say which processes are running, so the launch could not be confirmed either way",
            headline: "Minecraft was asked to start, but the launcher could not check whether it did.",
            nextStep: "If Minecraft does not appear within a few seconds, press Play again.",
        };
    }

    if (facts.hresult === "") {
        return {
            kind: "activation-refused",
            started: false,
            summary: "The activation call never completed, so Windows never gave a result",
            headline: "Windows could not be asked to start Minecraft.",
            nextStep:
                "Restart the computer and press Play again. If it still will not start, check that antivirus " +
                "software is not blocking the launcher, then open Logs and send the log file.",
        };
    }

    if (facts.hresult !== ACTIVATION_SUCCESS_HRESULT) {
        return {
            kind: "activation-refused",
            started: false,
            summary:
                `Windows refused to start the app with ${facts.hresult} (${describeHresult(facts.hresult)})` +
                (facts.usedShellFallback ? ", and the shell was asked instead and produced nothing" : ""),
            headline: `Windows would not start Minecraft. It refused with code ${facts.hresult}.`,
            nextStep: nextStepForHresult(facts.hresult),
        };
    }

    // Windows accepted the request from here down, so nothing below may blame Windows for it.
    if (facts.activationPid > 0 && !facts.activationPidAlive) {
        return crashedOnStartup(facts.activationPid);
    }

    if (facts.activationPid > 0 && facts.activationPidAlive) {
        return {
            kind: "foreign-process",
            started: false,
            summary: `Windows started process ${facts.activationPid}, which is still running but is not Minecraft`,
            headline: "Windows started something for Minecraft, but the game itself never appeared.",
            nextStep:
                `Open Task Manager, end the task with process id ${facts.activationPid}, then press Play again. ` +
                "If it happens again, open Logs and send the log file.",
        };
    }

    if (facts.processes.length > 0) {
        const other = facts.processes[0];
        return {
            kind: "other-build-running",
            started: false,
            summary:
                `Minecraft is running as process ${other.pid} from ${other.executablePath || "an unreadable path"}, ` +
                `which is not the build this profile uses (${facts.versionPath})`,
            headline: "A different copy of Minecraft is already running, so this profile could not start.",
            nextStep: "Close the Minecraft that is already open, then press Play again.",
        };
    }

    return {
        kind: "no-process-created",
        started: false,
        summary: `Windows accepted the request (${facts.hresult}) but created no process at all`,
        headline: "Windows agreed to open Minecraft but never actually started it.",
        nextStep:
            "Antivirus software blocking Minecraft is the most common cause, so allow Minecraft and the " +
            "launcher in it. Then restart the computer and press Play again.",
    };
}

/** The two-part message a user sees. Always both halves: what happened, then what to do. */
export function launchFailureMessage(verdict: LaunchVerdict): string {
    return `${verdict.headline}\n\n${verdict.nextStep}`;
}
