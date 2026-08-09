import { Channel } from "@renderer/scripts/domain/Channel";
import { errnoCode } from "@renderer/scripts/Directories";
import { log, logBlock } from "@renderer/scripts/LauncherLog";
import { describeError, describeResult, readMarker, runPowerShell } from "@shared/diagnostics/ProcessRunner";
import { ForeignGameDataError, ProcessInfo, SystemSetupRequiredError } from "../LauncherPlatform";
import * as Activation from "./Activation";
import * as DataLink from "./DataLink";
import {
    classifyLaunch,
    classifyMachineReadiness,
    describeHresult,
    launchFailureMessage,
    LaunchFacts,
} from "./LaunchDiagnostics";
import * as Licence from "./Licence";
import * as Packages from "./Packages";
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
    proxy: boolean;
}

function samePath(a: string, b: string): boolean {
    return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
    const result = await runPowerShell(
        `$found = @(Get-CimInstance Win32_Process -Filter "Name='${executableName.replace(/'/g, "''")}'" `
        + `-Property ProcessId,ThreadCount,ExecutablePath)\n`
        + `foreach ($p in $found) {\n`
        + `    Write-Output ('PROC=' + $p.ProcessId + '|' + $p.ThreadCount + '|' + $p.ExecutablePath)\n`
        + `}\n`
        + `Write-Output 'STATE=ok'`,
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

    const detail = `${processes.length} live ${executableName}`
        + (tombstones > 0 ? `, ${tombstones} already exited` : "")
        + processes.map(p => `\n    ${p.pid} ${p.executablePath || "(image path unreadable)"}`).join("");
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
                `Minecraft's ${desired.channel} data cannot be set up because a file is sitting where its `
                + `folder belongs.\n\nRename or delete that file, then press Play again.\n\n"${roaming}"`
            );

        case "foreign-data":
            log("Machine", `Cannot link ${desired.channel} game data: ${roaming} holds data no profile owns`);
            throw new ForeignGameDataError(desired.channel, roaming);

        case "linked":
            if (samePath(state.target, desired.dataDir)) {
                log("Machine", `${desired.channel} game data already points at this profile, leaving it: ${roaming} -> ${state.target}`);
                return;
            }
            log("Machine", `${desired.channel} game data points at ${state.target}, repointing it at ${desired.dataDir}`);
            status("Switching game data to this profile...");
            DataLink.unlink(desired.channel);
            break;

        case "empty-dir":
            log("Machine", `${desired.channel} game data is an empty real folder, replacing it with a junction to ${desired.dataDir}`);
            status("Linking game data to this profile...");
            DataLink.removeEmptyDir(desired.channel);
            break;

        case "absent":
            log("Machine", `${desired.channel} game data folder does not exist, creating a junction to ${desired.dataDir}`);
            status("Creating game data folder...");
            break;
    }

    DataLink.link(desired.channel, desired.dataDir);
}

/** Every registration failure ends somewhere a user can go next, whatever Windows said. */
const SETUP_NEXT_STEP =
    "Close Minecraft if it is open, restart the computer, then press Play again. If it still will not "
    + "set up, open Logs and send the log file, which holds what Windows said.";

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
            "Windows would not say whether Developer Mode is on or whether policy blocks sideloading, so the "
            + "launch carries on and lets registration or activation give the real answer"
        );
        return;
    }

    const readiness = classifyMachineReadiness({ developerMode, sideloadingBlockedByPolicy });

    log(
        "Machine",
        `Machine preconditions: Developer Mode ${developerMode ? "on" : "off"}, `
        + `sideloading blocked by this computer's policy ${sideloadingBlockedByPolicy ? "yes" : "no"}, `
        + `verdict "${readiness.kind}"`
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
        },
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
 * The repair runs after Developer Mode is already on, so a registry read that fails here must
 * not throw away a fix the user has just consented to and been prompted for.
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
    status: (m: string) => void,
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
        log("Machine", "Windows refused the registration for want of Developer Mode, asking for permission to turn it on");
        throw new SystemSetupRequiredError(
            readiness.headline,
            `${readiness.explanation}\n\n${readiness.nextStep}`,
            readiness.manualStep,
            () => Packages.enableDeveloperMode(),
        );
    }

    // Windows holds a package briefly after its last process goes, so one wait often clears
    // it. Killing whatever holds it is not the launcher's call, hence the message if it does not.
    if (failure.blocker === "package-in-use") {
        log("Machine", "Windows still holds the package, waiting 4s and registering once more");
        status("Waiting for Windows to release the previous Minecraft...");
        await new Promise(resolve => setTimeout(resolve, 4000));
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
                "Minecraft is still open, or Windows has not finished closing it.\n\n"
                + "Close Minecraft, wait a few seconds, then press Play again."
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
            log("Machine", `Could not clear the conflicting ${family} registration, registering anyway: ${describeError(e)}`);
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
            throw new Error(
                `Minecraft could not be set up on this computer.\n\n${e.message}\n\n${SETUP_NEXT_STEP}`
            );
        }
    }

    logBlock("Machine", `No repair exists for blocker "${failure.blocker}", giving up on registration`, failure.detail);
    throw new Error(
        `Minecraft could not be set up on this computer.\n\n${failure.message}\n\n${SETUP_NEXT_STEP}`
    );
}

/** Touches only this build's own family; another channel's registration is never disturbed. */
async function reconcilePackage(desired: DesiredState, status: (m: string) => void): Promise<void> {
    const wantFamily = packageFamilyFor(desired.versionPath).toLowerCase();
    const registered = Packages.listRegistered();
    const sameFamily = registered.filter(pkg => pkg.family.toLowerCase() === wantFamily);

    if (sameFamily.some(pkg => samePath(pkg.installPath, desired.versionPath))) {
        log("Machine", `${wantFamily} is already registered to ${desired.versionPath}, leaving the registration alone`);
        return;
    }

    const seen = registered.length === 0
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
        `Reconciling ${desired.channel}: build ${desired.versionPath}, data ${desired.dataDir}, `
        + `proxy ${desired.proxy ? "required" : "not required"}`
    );

    // First, and on every launch: it is the one blocker that costs nothing to read, and a launch
    // that proceeds without it ends in a refusal or an instant exit with no reason attached.
    status("Checking Windows settings...");
    assertMachineReady(desired);

    // Cheap and reversible first, invasive last.
    reconcileDataLink(desired, status);
    await VersionFiles.ensureVersionFiles(desired.versionPath, desired.channel, status);

    if (desired.proxy) {
        if (VersionFiles.isProxyCurrent(desired.versionPath)) {
            log("Machine", `The proxy in ${desired.versionPath} is already the launcher's own build, leaving it`);
        } else {
            status("Installing runtime proxy...");
            VersionFiles.installProxy(desired.versionPath);
        }
    } else if (VersionFiles.isProxyPresent(desired.versionPath)) {
        log("Machine", `This profile is unmodded but ${desired.versionPath} holds a proxy, removing it`);
        status("Removing runtime proxy...");
        VersionFiles.removeProxy(desired.versionPath);
    } else {
        log("Machine", `This profile is unmodded and ${desired.versionPath} holds no proxy, nothing to do`);
    }

    await reconcilePackage(desired, status);
    log("Machine", `Reconciled ${desired.channel} for ${desired.versionPath}`);
}

/** Where the channel's data folder currently points, or null if it isn't linked. */
export function currentDataTarget(channel: Channel): string | null {
    const state = DataLink.readLink(channel);
    return state.kind === "linked" ? state.target : null;
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
 * That identity is load-bearing: the loader then resolves imports through the package
 * graph, so the dxgi.dll proxy sitting in the build folder wins over System32's. A plain
 * CreateProcess on the exe starts the game but has no package identity, so System32 wins
 * and mods silently never load.
 *
 * By AUMID rather than protocol - `Add-AppxPackage -Register` leaves
 * `HKCU\Software\Classes\<proto>` a stub with no `shell\open\command`.
 */
export async function activate(
    versionPath: string,
    dataDir: string,
    onStatus?: (m: string) => void
): Promise<void> {
    const status = onStatus ?? (() => {});
    const wantFamily = packageFamilyFor(versionPath).toLowerCase();
    const registered = Packages.listRegistered();
    const pkg = registered.find(p => p.family.toLowerCase() === wantFamily);

    if (!pkg) {
        const seen = registered.length === 0
            ? "no Minecraft packages are registered"
            : registered.map(p => `${p.family} -> ${p.installPath}`).join("; ");
        log(
            "Machine",
            `Cannot activate ${wantFamily}: ${seen}. Expected it to be registered to ${versionPath} `
            + `by the reconcile step that just ran`
        );
        throw new Error(
            "Minecraft was set up but Windows has no record of it, so it cannot be started.\n\n"
            + "Press Play again. If that does not help, restart the computer and try once more."
        );
    }

    // A resolvable app id is the other half of "registered": the family comes from the registry
    // and the application id from the build, and an activation with either half wrong resolves
    // to nothing at all while still reporting a success.
    let applicationId: string;
    try {
        applicationId = Packages.readApplicationId(versionPath);
    } catch (e) {
        log("Machine", `Cannot build an app id for ${versionPath}: ${describeError(e)}`);
        throw new Error(
            "This Minecraft version is missing the file Windows needs in order to start it.\n\n"
            + "Delete this version in the launcher and download it again.",
            { cause: e }
        );
    }

    const aumid = `${pkg.familyName}!${applicationId}`;
    log("Machine", `Activating ${aumid}`);
    log("Machine", `Build holds ${VersionFiles.describePayload(versionPath)}`);

    // The activation manager is tried first because it is the only path that returns a reason,
    // but it is never allowed to be the only path: any refusal falls through to the shell, which
    // is what has always worked here, so a machine that launches today still launches today.
    const outcome = await Activation.activateByAumid(aumid);
    let launchedBy: string;
    let shellSpawnError = "";

    if (outcome.ok) {
        launchedBy = `the activation manager, which created process ${outcome.pid}`;
        log("Machine", `Activation manager started ${aumid} as pid ${outcome.pid} (HRESULT ${outcome.hresult})`);
    } else {
        launchedBy = "the shell, after the activation manager refused";
        logBlock(
            "Machine",
            `Activation manager would not start ${aumid} (HRESULT ${outcome.hresult || "none"}, `
            + `${describeHresult(outcome.hresult)}), falling back to the shell`,
            outcome.detail
        );
        shellSpawnError = await activateViaShell(aumid);
    }

    status("Waiting for Minecraft to start...");
    await confirmStarted(aumid, versionPath, dataDir, pkg, outcome, launchedBy, shellSpawnError);
}

/** Resolves once explorer.exe is up, or with the reason it could not be started. */
function activateViaShell(aumid: string): Promise<string> {
    return new Promise(resolve => {
        let settled = false;
        const settle = (failure: string): void => {
            if (settled) return;
            settled = true;
            resolve(failure);
        };

        const explorer = child.spawn("explorer.exe", [`shell:AppsFolder\\${aumid}`], {
            detached: true,
            stdio: "ignore",
        });
        explorer.on("error", error => {
            log("Machine", `explorer.exe could not be started to activate ${aumid}: ${describeError(error)}`);
            settle(describeError(error));
        });
        explorer.on("spawn", () => {
            log("Machine", `explorer.exe shell:AppsFolder\\${aumid} started as pid ${explorer.pid ?? "unknown"}`);
            settle("");
        });
        explorer.unref();
    });
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

/**
 * Whether the process Windows says it created is still there. Two witnesses, and either one is
 * enough: the process list only ever sees the game, so a live process id it does not hold is
 * still a live process, and calling that a crash is the mistake worth being careful about.
 */
function activationPidAlive(pid: number, probe: ProcessProbe): boolean {
    if (pid <= 0) return false;
    if (!probe.queryFailed && probe.processes.some(p => p.pid === pid)) return true;
    return isAlive(pid);
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
async function confirmStarted(
    aumid: string,
    versionPath: string,
    dataDir: string,
    pkg: Packages.RegisteredPackage,
    outcome: Activation.ActivationOutcome,
    launchedBy: string,
    shellSpawnError: string
): Promise<void> {
    const startedAt = Date.now();
    let probe: ProcessProbe = { processes: [], queryFailed: true, detail: "not checked yet" };

    const facts = (): LaunchFacts => ({
        versionPath,
        hresult: outcome.hresult,
        activationPid: outcome.pid,
        activationPidAlive: activationPidAlive(outcome.pid, probe),
        usedShellFallback: !outcome.ok,
        shellSpawnError,
        processes: probe.processes,
        probeFailed: probe.queryFailed,
    });

    let verdict = classifyLaunch(facts());

    while (Date.now() - startedAt < ACTIVATION_TIMEOUT_MS) {
        await sleep(ACTIVATION_POLL_MS);
        probe = await probeProcesses(GAME_EXECUTABLE);
        verdict = classifyLaunch(facts());

        if (verdict.kind === "running") {
            log("Machine", `${aumid} is up: ${verdict.summary}, via ${launchedBy}`);
            return;
        }

        // A process id Windows handed back that is already gone is a finished answer, not a
        // slow one, so the user is told it crashed now instead of in fifteen seconds' time.
        if (verdict.kind === "exited-immediately") break;
    }

    if (verdict.started) {
        log("Machine", `${aumid} was started via ${launchedBy}, but ${verdict.summary}`);
        return;
    }

    const seen = probe.processes.length === 0
        ? "none"
        : probe.processes.map(p => `${p.pid} ${p.executablePath || "(image path unreadable)"}`).join("; ");

    const createdProcess = outcome.pid > 0
        ? `Windows created process ${outcome.pid}, which ${activationPidAlive(outcome.pid, probe) ? "is still running" : "has already exited"}`
        : "Windows created no process";

    const detail =
        `Outcome: ${verdict.kind}, ${verdict.summary}\n`
        + `App id: ${aumid}\n`
        + `Started by: ${launchedBy}\n`
        + `Activation result: ${outcome.hresult || "none"} (${describeHresult(outcome.hresult)})\n`
        + `${createdProcess}\n`
        + (shellSpawnError ? `Shell fallback: ${shellSpawnError}\n` : "")
        + `Waited: ${Math.round((Date.now() - startedAt) / 1000)}s\n`
        + `Expected build: ${versionPath}\n`
        + `Build holds: ${VersionFiles.describePayload(versionPath)}\n`
        + `Registered as: ${pkg.family} -> ${pkg.installPath}\n`
        + `Licence files in ${dataDir}: ${Licence.describeEntitlements(dataDir)}\n`
        + `Developer Mode: ${describeSetting(Packages.readDeveloperMode(), "on", "off")}\n`
        + `Sideloading blocked by this computer's policy: `
        + `${describeSetting(Packages.readSideloadingPolicyBlock(), "yes", "no")}\n`
        + `Minecraft processes running: ${seen}\n`
        + `Process query: ${probe.detail}`;

    logBlock("Machine", `${aumid} did not end up running: ${verdict.kind}`, detail);

    // Windows keeps its own account of the activation, and it is routinely the only place the
    // real reason is written down. A tester cannot be asked to go and read Event Viewer. Skipped
    // when the game itself crashed, because that reason is in the game's log and not in Windows'.
    if (verdict.kind !== "exited-immediately") {
        const sinceSeconds = Math.round((Date.now() - startedAt) / 1000) + 30;
        const events = await Activation.recentAppModelEvents(sinceSeconds);
        logBlock("Machine", `What Windows recorded in the last ${sinceSeconds} seconds`, events);
    }

    throw new Error(launchFailureMessage(verdict));
}
