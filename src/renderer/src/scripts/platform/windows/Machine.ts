import { Channel } from "@renderer/scripts/domain/Channel";
import { errnoCode } from "@renderer/scripts/Directories";
import { log, logBlock } from "@renderer/scripts/LauncherLog";
import { describeResult, psQuote, readMarker, runPowerShell } from "@shared/diagnostics/ProcessRunner";
import { describeError } from "@shared/diagnostics/Log";
import { ForeignGameDataError, ProcessInfo, SystemSetupRequiredError } from "../LauncherPlatform";
import * as DataLink from "./DataLink";
import { classifyLaunch, classifyMachineReadiness, launchFailureMessage, LaunchFacts } from "./LaunchDiagnostics";
import * as Licence from "./Licence";
import * as Packages from "./Packages";
import * as Preload from "./Preload";
import * as VersionFiles from "./VersionFiles";

const child = window.require("child_process") as typeof import("child_process");
const path = window.require("path") as typeof import("path");

export const GAME_EXECUTABLE = VersionFiles.GAME_EXECUTABLE;

const PROCESS_QUERY_TIMEOUT_MS = 15_000;

/** How long the game gets to appear after activation before the launch is called a failure. */
const ACTIVATION_TIMEOUT_MS = 15_000;
const ACTIVATION_POLL_MS = 1_000;

/**
 * The slots one launch owns. Every one is scoped to a single channel or a single build:
 * release and preview are separate games with separate package families and separate
 * data folders, and a launch of one must never touch the other.
 */
export interface DesiredState {
    channel: Channel;
    versionPath: string;
    dataDir: string;
    modded: boolean;
}

/** What Windows said about a set of processes, including that it would not say. */
export interface ProcessProbe {
    processes: ProcessInfo[];
    /** True when the list is empty because the question could not be answered, not because nothing is running. */
    queryFailed: boolean;
    detail: string;
}

/**
 * One query answers both halves of the question: which processes exist, and which build each
 * was started from. ThreadCount separates a live process from a tombstone, a process that has
 * fully exited but is still listed because something holds a handle to it.
 *
 * A failed query is reported as a failed query and never as a process. Reading "running" out of
 * an unanswered question is what made launches refuse themselves with "Minecraft is already
 * running" on machines where nothing was running.
 */
export async function probeProcesses(executableName: string): Promise<ProcessProbe> {
    // Two grammars, one after the other: the name is escaped for a WQL string literal, and the
    // whole filter is then escaped for the PowerShell single-quoted string that carries it. A
    // double-quoted string here would interpolate whatever `$` or backtick the name held.
    const filter = `Name='${executableName.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

    const result = await runPowerShell(
        `$filter = '${psQuote(filter)}'\n` +
            `$found = @(Get-CimInstance Win32_Process -Filter $filter ` +
            `-Property ProcessId,ThreadCount,ExecutablePath)\n` +
            `foreach ($p in $found) {\n` +
            `    Write-Output ('PROC=' + $p.ProcessId + '|' + $p.ThreadCount + '|' + $p.ExecutablePath)\n` +
            `}\n` +
            `Write-Output 'STATE=ok'`,
        { timeoutMs: PROCESS_QUERY_TIMEOUT_MS }
    );

    if (result.code !== 0 || readMarker(result.output, "STATE") !== "ok") {
        const detail = describeResult(result);
        logBlock("Machine", `Could not ask Windows which ${executableName} processes are running`, detail);
        return { processes: [], queryFailed: true, detail };
    }

    const processes: ProcessInfo[] = [];
    let tombstones = 0;

    for (const line of result.stdout.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("PROC=")) continue;

        const [pidText, threadText, ...rest] = trimmed.slice("PROC=".length).split("|");
        const pid = parseInt(pidText, 10);
        const threads = parseInt(threadText, 10);
        if (!Number.isFinite(pid) || !Number.isFinite(threads)) {
            log("Machine", `Ignoring an unreadable process line for ${executableName}: ${trimmed}`);
            continue;
        }
        if (threads <= 0) {
            tombstones += 1;
            continue;
        }

        processes.push({ pid, executablePath: rest.join("|").trim() });
    }

    const detail =
        `${processes.length} live ${executableName}` +
        (tombstones > 0 ? `, ${tombstones} already exited` : "") +
        processes.map(p => `\n    ${p.pid} ${p.executablePath || "(image path unreadable)"}`).join("");
    log("Machine", `Windows reports ${detail}`);
    return { processes, queryFailed: false, detail };
}

function reconcileDataLink(desired: DesiredState, status: (m: string) => void): void {
    const state = DataLink.readLink(desired.channel);
    const roaming = DataLink.roamingPath(desired.channel);

    switch (state.kind) {
        case "blocked-by-file":
            log("Machine", `Cannot link ${desired.channel} game data: ${roaming} is a file`);
            throw new Error(
                `Minecraft's ${desired.channel} data cannot be set up because a file is sitting where its ` +
                    `folder belongs.\n\nRename or delete that file, then press Play again.\n\n"${roaming}"`
            );

        case "foreign-data":
            log("Machine", `Cannot link ${desired.channel} game data: ${roaming} holds data no profile owns`);
            throw new ForeignGameDataError(desired.channel, roaming);

        case "linked":
            if (Packages.samePath(state.target, desired.dataDir)) {
                log(
                    "Machine",
                    `${desired.channel} game data already points at this profile, leaving it: ${roaming} -> ${state.target}`
                );
                return;
            }
            log(
                "Machine",
                `${desired.channel} game data points at ${state.target}, repointing it at ${desired.dataDir}`
            );
            status("Switching game data to this profile...");
            DataLink.relink(desired.channel, desired.dataDir, state.target);
            return;

        case "empty-dir":
            log(
                "Machine",
                `${desired.channel} game data is an empty real folder, replacing it with a junction to ${desired.dataDir}`
            );
            status("Linking game data to this profile...");
            DataLink.removeEmptyDir(desired.channel);
            break;

        case "absent":
            log(
                "Machine",
                `${desired.channel} game data folder does not exist, creating a junction to ${desired.dataDir}`
            );
            status("Creating game data folder...");
            break;
    }

    DataLink.link(desired.channel, desired.dataDir);
}

/** Every registration failure ends somewhere a user can go next, whatever Windows said. */
const SETUP_NEXT_STEP =
    "Close Minecraft if it is open, restart the computer, then press Play again. If it still will not " +
    "set up, open Logs and send the log file, which holds what Windows said.";

/**
 * The two machine-wide settings Windows checks every time a loose-registered package is run,
 * not only when it is registered. A machine that registered the package while Developer Mode
 * was on keeps the registration after it is turned off, so nothing else on the launch path
 * notices, and Windows then refuses the activation or kills the process on sight.
 */
function assertMachineReady(desired: DesiredState): void {
    const developerMode = Packages.readDeveloperMode();
    const sideloadingBlockedByPolicy = Packages.readSideloadingPolicyBlock();

    if (developerMode === null || sideloadingBlockedByPolicy === null) {
        log(
            "Machine",
            "Windows would not say whether Developer Mode is on or whether policy blocks sideloading, so the " +
                "launch carries on and lets registration or activation give the real answer"
        );
        return;
    }

    const readiness = classifyMachineReadiness({ developerMode, sideloadingBlockedByPolicy });

    log(
        "Machine",
        `Machine preconditions: Developer Mode ${developerMode ? "on" : "off"}, ` +
            `sideloading blocked by this computer's policy ${sideloadingBlockedByPolicy ? "yes" : "no"}, ` +
            `verdict "${readiness.kind}"`
    );

    if (readiness.kind === "ready") return;

    if (readiness.kind === "sideloading-blocked") {
        throw new Error(`${readiness.headline}\n\n${readiness.explanation}\n\n${readiness.nextStep}`);
    }

    throw new SystemSetupRequiredError(
        readiness.headline,
        `${readiness.explanation}\n\n${readiness.nextStep}`,
        readiness.manualStep,
        async status => {
            await Packages.enableDeveloperMode();
            await dropRegistration(desired.versionPath, status);
        }
    );
}

/**
 * A registration made from a build folder stops being runnable the moment Developer Mode goes
 * off, and turning it back on does not revive it - Windows keeps the registry entry but refuses
 * to start it. reconcilePackage trusts that entry and skips straight to an activation that dies
 * on the spot, so the entry has to go with it.
 *
 * Only this launch's own game. Unregistering takes the package's local data with it, and the
 * other channel may be a Microsoft Store install with somebody's worlds in it, which this
 * launch neither touches nor needs.
 */
async function dropRegistration(versionPath: string, status: (m: string) => void): Promise<void> {
    let family: string;
    try {
        family = packageFamilyFor(versionPath);
    } catch (e) {
        log("Machine", `Cannot tell which game ${versionPath} is, so no registration is dropped: ${describeError(e)}`);
        return;
    }

    const wanted = family.toLowerCase();
    const registered = listRegisteredSafely().filter(pkg => pkg.family.toLowerCase() === wanted);
    if (registered.length === 0) {
        log("Machine", `Nothing registered as ${family}, so the launch registers it from scratch anyway`);
        return;
    }

    status("Setting Minecraft up again...");
    for (const pkg of registered) {
        log("Machine", `Dropping the ${pkg.family} registration at ${pkg.installPath} so it is made again`);
        try {
            await Packages.unregister(pkg.family);
        } catch (e) {
            log(
                "Machine",
                `Could not drop ${pkg.family}, the registration that follows replaces it anyway: ${describeError(e)}`
            );
        }
    }
}

/**
 * Every caller is on the launch path, where a registry read that fails is a reason to register
 * again rather than a reason to stop - and where the raw failure would otherwise reach the user
 * as a stack trace in the launch banner instead of something to do about it.
 */
function listRegisteredSafely(): Packages.RegisteredPackage[] {
    try {
        return Packages.listRegistered();
    } catch (e) {
        log("Machine", `Could not read which Minecraft packages are registered: ${describeError(e)}`);
        return [];
    }
}

/**
 * One repair per blocker, and at most one permission prompt across the whole launch. The
 * unrepairable branches come first: when sideloading is policy-blocked or Developer Mode is
 * off, no amount of unregistering can make a registration succeed.
 */
async function repairAndRetry(
    failure: Packages.PackageRegistrationError,
    desired: DesiredState,
    status: (m: string) => void
): Promise<void> {
    logBlock(
        "Machine",
        `Registration of ${desired.versionPath} failed with blocker "${failure.blocker}", deciding what to repair`,
        failure.detail
    );

    if (failure.blocker === "sideloading-policy") {
        const readiness = classifyMachineReadiness({ developerMode: true, sideloadingBlockedByPolicy: true });
        log("Machine", "Sideloading is blocked by this computer's policy, which the launcher cannot change");
        throw new Error(`${readiness.headline}\n\n${readiness.explanation}\n\n${readiness.nextStep}`);
    }

    // Windows can refuse for want of Developer Mode while the registry value reads as on, so this
    // branch is decided by what Windows said and not by re-reading the setting.
    if (failure.blocker === "developer-mode") {
        const readiness = classifyMachineReadiness({ developerMode: false, sideloadingBlockedByPolicy: false });
        log(
            "Machine",
            "Windows refused the registration for want of Developer Mode, asking for permission to turn it on"
        );
        throw new SystemSetupRequiredError(
            readiness.headline,
            `${readiness.explanation}\n\n${readiness.nextStep}`,
            readiness.manualStep,
            () => Packages.enableDeveloperMode()
        );
    }

    // Windows holds a package briefly after its last process goes, so one wait often clears
    // it. Killing whatever holds it is not the launcher's call, hence the message if it does not.
    if (failure.blocker === "package-in-use") {
        log("Machine", "Windows still holds the package, waiting 4s and registering once more");
        status("Waiting for Windows to release the previous Minecraft...");
        await Licence.sleep(4000);
        try {
            await Packages.register(desired.versionPath);
            log("Machine", "Registration succeeded on the retry after the package was released");
            return;
        } catch (e) {
            if (!(e instanceof Packages.PackageRegistrationError)) {
                log("Machine", `Retry after the package-in-use wait failed for another reason: ${describeError(e)}`);
                throw e;
            }
            logBlock("Machine", `Windows still holds the package after the wait (blocker ${e.blocker})`, e.detail);
            throw new Error(
                "Minecraft is still open, or Windows has not finished closing it.\n\n" +
                    "Close Minecraft, wait a few seconds, then press Play again."
            );
        }
    }

    if (failure.blocker === "conflicting-registration") {
        const family = packageFamilyFor(desired.versionPath);
        log("Machine", `Another registration claims ${family}, removing it before registering again`);
        status("Removing a conflicting Minecraft registration...");
        try {
            await Packages.unregister(family);
        } catch (e) {
            log(
                "Machine",
                `Could not clear the conflicting ${family} registration, registering anyway: ${describeError(e)}`
            );
        }

        status("Registering Minecraft...");
        try {
            await Packages.register(desired.versionPath);
            log("Machine", `Registration succeeded after clearing the conflicting ${family} registration`);
            return;
        } catch (e) {
            if (!(e instanceof Packages.PackageRegistrationError)) {
                log("Machine", `Retry after clearing ${family} failed for another reason: ${describeError(e)}`);
                throw e;
            }
            logBlock("Machine", `Registration still refused after clearing ${family} (blocker ${e.blocker})`, e.detail);
            throw new Error(`Minecraft could not be set up on this computer.\n\n${e.message}\n\n${SETUP_NEXT_STEP}`);
        }
    }

    logBlock("Machine", `No repair exists for blocker "${failure.blocker}", giving up on registration`, failure.detail);
    throw new Error(`Minecraft could not be set up on this computer.\n\n${failure.message}\n\n${SETUP_NEXT_STEP}`);
}

/** Touches only this build's own family; another channel's registration is never disturbed. */
async function reconcilePackage(desired: DesiredState, status: (m: string) => void): Promise<void> {
    const wantFamily = packageFamilyFor(desired.versionPath).toLowerCase();
    const registered = listRegisteredSafely();
    const sameFamily = registered.filter(pkg => pkg.family.toLowerCase() === wantFamily);

    if (sameFamily.some(pkg => Packages.samePath(pkg.installPath, desired.versionPath))) {
        log("Machine", `${wantFamily} is already registered to ${desired.versionPath}, leaving the registration alone`);
        return;
    }

    const seen =
        registered.length === 0
            ? "no Minecraft packages are registered"
            : registered.map(p => `${p.family} -> ${p.installPath}`).join("; ");
    log("Machine", `${wantFamily} is not registered to ${desired.versionPath}. Registry holds: ${seen}`);

    // Best effort: a stale entry that will not come off is not itself fatal, because the
    // registration below is verified either way.
    for (const pkg of sameFamily) {
        log("Machine", `Removing the stale ${pkg.family} registration that points at ${pkg.installPath}`);
        status(`Unregistering ${pkg.family}...`);
        try {
            await Packages.unregister(pkg.family);
        } catch (e) {
            log("Machine", `Could not unregister ${pkg.family}, continuing: ${describeError(e)}`);
        }
    }

    status("Registering Minecraft...");
    try {
        await Packages.register(desired.versionPath);
    } catch (e) {
        if (!(e instanceof Packages.PackageRegistrationError)) {
            log("Machine", `Registering ${desired.versionPath} failed with an unclassified error: ${describeError(e)}`);
            throw e;
        }
        await repairAndRetry(e, desired, status);
    }
}

/** The appx family a build belongs to, i.e. which of the two games it is. */
export function packageFamilyFor(versionPath: string): string {
    return Packages.readIdentityName(versionPath);
}

/**
 * Brings the machine's global slots in line with `desired`, applying only what
 * differs. Idempotent, so a run interrupted halfway is just a smaller diff next time.
 */
export async function reconcile(desired: DesiredState, onStatus?: (m: string) => void): Promise<void> {
    const status = onStatus ?? (() => {});

    log(
        "Machine",
        `Reconciling ${desired.channel}: build ${desired.versionPath}, data ${desired.dataDir}, ` +
            `mods ${desired.modded ? "on" : "off"}`
    );

    // First, and on every launch: it is the one blocker that costs nothing to read, and a launch
    // that proceeds without it ends in a refusal or an instant exit with no reason attached.
    status("Checking Windows settings...");
    assertMachineReady(desired);

    // Cheap and reversible first, invasive last.
    reconcileDataLink(desired, status);
    await VersionFiles.ensureVersionFiles(desired.versionPath, desired.channel, status);

    Preload.ensurePreload(desired.versionPath, GAME_EXECUTABLE, desired.modded, status);

    await reconcilePackage(desired, status);
    log("Machine", `Reconciled ${desired.channel} for ${desired.versionPath}`);
}

/** Where the channel's data folder currently points, or null if it isn't linked. */
export function currentDataTarget(channel: Channel): string | null {
    const state = DataLink.readLink(channel);
    return state.kind === "linked" ? state.target : null;
}

/** Points a channel's game data folder at a profile, replacing whatever is there. */
export function linkChannel(channel: Channel, dataDir: string): void {
    const state = DataLink.readLink(channel);
    if (state.kind === "linked") {
        DataLink.relink(channel, dataDir, state.target);
        return;
    }
    if (state.kind === "empty-dir") DataLink.removeEmptyDir(channel);
    DataLink.link(channel, dataDir);
}

export function unlinkChannel(channel: Channel): void {
    const state = DataLink.readLink(channel);
    if (state.kind !== "linked") {
        log("Machine", `Nothing to unlink for ${channel}: its game data folder is "${state.kind}"`);
        return;
    }
    DataLink.unlink(channel);
}

export function foreignDataPath(channel: Channel): string | null {
    return DataLink.readLink(channel).kind === "foreign-data" ? DataLink.roamingPath(channel) : null;
}

/**
 * Activates the registered package, which is what gives the process package identity.
 *
 * Identity is no longer what makes mods load: the preload is named in the game's own import
 * table, so the loader resolves it out of the build folder however the process was started.
 * What identity is still needed for is the game itself - Xbox Live sign-in, the store, and the
 * entitlement Windows checks before it will activate the package at all.
 *
 * By AUMID rather than protocol - `Add-AppxPackage -Register` leaves
 * `HKCU\Software\Classes\<proto>` a stub with no `shell\open\command`.
 */
/**
 * Starts the build's own executable. Registration still happens, so Windows keeps the package on
 * file and its Start menu entry works; this is only about which process the Play button creates.
 */
export async function startGame(versionPath: string, onStatus?: (m: string) => void): Promise<boolean> {
    const status = onStatus ?? (() => {});
    const executable = path.join(versionPath, GAME_EXECUTABLE);

    log("Machine", `Starting ${executable}`);
    log("Machine", `Build holds ${VersionFiles.describePayload(versionPath)}`);

    let spawned: import("child_process").ChildProcess;
    try {
        spawned = child.spawn(executable, [], { cwd: versionPath, detached: true, stdio: "ignore" });
        spawned.unref();
    } catch (e) {
        log("Machine", `Could not start ${executable}: ${describeError(e)}`);
        throw new Error(
            "Minecraft could not be started. Check that antivirus software is not blocking it, then press Play again.",
            { cause: e }
        );
    }

    const pid = spawned.pid ?? 0;
    if (pid === 0) {
        log("Machine", `${executable} spawned without a pid, so it cannot be waited on`);
        return false;
    }
    log("Machine", `${executable} started as pid ${pid}`);

    status("Waiting for Minecraft to start...");
    return confirmStarted(executable, versionPath, pid);
}

/**
 * Whether a process id Windows handed back is still alive, without disturbing it.
 *
 * EPERM is the answer for a process this one is not allowed to query, and a process that cannot
 * be queried is emphatically a process that exists. Reading it as "gone" is what turned a running
 * game into a report that Windows had created a process which "has already exited".
 */
function isAlive(pid: number): boolean {
    if (pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        const code = errnoCode(e);
        if (code === "EPERM") return true;
        if (code !== "ESRCH") {
            log("Machine", `Could not tell whether process ${pid} is alive, treating it as gone: ${describeError(e)}`);
        }
        return false;
    }
}

/** A setting Windows would not report reads as unknown, never as the safe-looking answer. */
function describeSetting(value: boolean | null, yes: string, no: string): string {
    if (value === null) return "Windows would not say";
    return value ? yes : no;
}

/**
 * The activation result and the poll answer different questions and both are needed. The HRESULT
 * says whether Windows accepted the request; only the poll says whether a game is there, because
 * a process Windows created and that exited a moment later reports as a success.
 *
 * Windows refusing, Windows starting nothing, and the game dying on its own are three different
 * problems with three different fixes, so the verdict is decided from the facts in one place
 * rather than described as one failure with several possible causes.
 */
async function confirmStarted(executable: string, versionPath: string, pid: number): Promise<boolean> {
    const startedAt = Date.now();
    let probe: ProcessProbe = { processes: [], queryFailed: true, detail: "not checked yet" };

    const facts = (): LaunchFacts => ({
        versionPath,
        hresult: "",
        activationPid: pid,
        activationPidAlive: isAlive(pid),
        usedShellFallback: false,
        shellSpawnError: "",
        processes: probe.processes,
        probeFailed: probe.queryFailed,
    });

    let verdict = classifyLaunch(facts());

    while (Date.now() - startedAt < ACTIVATION_TIMEOUT_MS) {
        await Licence.sleep(ACTIVATION_POLL_MS);
        probe = await probeProcesses(GAME_EXECUTABLE);
        verdict = classifyLaunch(facts());

        if (verdict.kind === "running") {
            log("Machine", `${executable} is up: ${verdict.summary}`);
            return true;
        }

        // A process id that is already gone is a finished answer, not a slow one, so the user is
        // told it crashed now instead of in fifteen seconds' time.
        if (verdict.kind === "exited-immediately") break;
    }

    // Started, but nothing confirmed it. Reported as such rather than as a success: telling the
    // user a game is running when the question could not be answered is how a failed launch
    // reached them as "started" with nothing on screen.
    if (verdict.started) {
        log("Machine", `${executable} was started as pid ${pid}, but ${verdict.summary}`);
        return false;
    }

    const seen =
        probe.processes.length === 0
            ? "none"
            : probe.processes.map(p => `pid ${p.pid} (${p.executablePath || "path unknown"})`).join(", ");

    const detail =
        `Outcome: ${verdict.kind}, ${verdict.summary}
` +
        `Started: ${executable} as pid ${pid}, still alive: ${isAlive(pid) ? "yes" : "no"}
` +
        `Waited: ${Math.round((Date.now() - startedAt) / 1000)}s
` +
        `Build holds: ${VersionFiles.describePayload(versionPath)}
` +
        `Developer Mode: ${describeSetting(Packages.readDeveloperMode(), "on", "off")}
` +
        `Minecraft processes running: ${seen}
` +
        `Process query: ${probe.detail}`;

    logBlock("Machine", `${executable} did not end up running: ${verdict.kind}`, detail);
    throw new Error(launchFailureMessage(verdict));
}
