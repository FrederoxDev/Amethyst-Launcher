import { Channel } from "@renderer/scripts/domain/Channel";
import { log, logBlock } from "@renderer/scripts/LauncherLog";
import { describeError, describeResult, readMarker, runPowerShell } from "@shared/diagnostics/ProcessRunner";
import { ForeignGameDataError, ProcessInfo, SystemSetupRequiredError } from "../LauncherPlatform";
import * as Activation from "./Activation";
import * as DataLink from "./DataLink";
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
            throw new Error(`"${roaming}" is a file, not a folder. Remove or rename it.`);

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
        log("Machine", "Sideloading is blocked by this computer's policy, which the launcher cannot change");
        throw new Error(
            "This computer's settings do not allow Minecraft to be set up, and the block is managed by "
            + "whoever administers it, so the launcher cannot change it. If this is a work or school "
            + "computer, its administrator has to allow app sideloading.\n\n"
            + `(${failure.detail})`
        );
    }

    if (failure.blocker === "developer-mode") {
        log("Machine", "Developer Mode is off, asking the user for permission to turn it on");
        throw new SystemSetupRequiredError(
            "Windows needs a setting turned on",
            "Windows will not let Minecraft be set up until Developer Mode is on. The launcher can turn it "
            + "on for you, but Windows will ask for permission first.\n\n"
            + "Choose Yes when the Windows permission prompt appears, and the launch will carry on by itself.",
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
            log("Machine", `Windows still holds the package after the wait (blocker ${e.blocker})`);
            throw new Error(
                "Minecraft is still open, or Windows has not finished closing it.\n\n"
                + "Close Minecraft, wait a few seconds, then press Launch again.\n\n"
                + `(${e.detail})`
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
            log("Machine", `Registration still refused after clearing ${family} (blocker ${e.blocker})`);
            throw new Error(
                `Minecraft could not be set up on this computer.\n\n${e.message}\n\n(${e.detail})`
            );
        }
    }

    log("Machine", `No repair exists for blocker "${failure.blocker}", giving up on registration`);
    throw new Error(
        `Minecraft could not be set up on this computer.\n\n${failure.message}\n\n(${failure.detail})`
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
        log("Machine", `Cannot activate ${wantFamily}: ${seen}`);
        throw new Error(
            `Minecraft was not set up on this computer, so it cannot be started.\n\n`
            + `Expected ${packageFamilyFor(versionPath)} from ${versionPath}, but ${seen}.`
        );
    }

    const aumid = `${pkg.familyName}!${Packages.readApplicationId(versionPath)}`;
    log("Machine", `Activating ${aumid}`);
    log("Machine", `Build holds ${VersionFiles.describePayload(versionPath)}`);

    // The activation manager is tried first because it is the only path that returns a reason,
    // but it is never allowed to be the only path: any refusal falls through to the shell, which
    // is what has always worked here, so a machine that launches today still launches today.
    const outcome = await Activation.activateByAumid(aumid);
    let launchedBy: string;

    if (outcome.ok) {
        launchedBy = `the activation manager, which created process ${outcome.pid}`;
        log("Machine", `Activation manager started ${aumid} as pid ${outcome.pid} (HRESULT ${outcome.hresult})`);
    } else {
        launchedBy = "the shell, after the activation manager refused";
        logBlock(
            "Machine",
            `Activation manager would not start ${aumid}, falling back to the shell`,
            outcome.detail
        );
        activateViaShell(aumid);
    }

    status("Waiting for Minecraft to start...");
    await confirmStarted(aumid, versionPath, dataDir, pkg, outcome, launchedBy);
}

function activateViaShell(aumid: string): void {
    const explorer = child.spawn("explorer.exe", [`shell:AppsFolder\\${aumid}`], {
        detached: true,
        stdio: "ignore",
    });
    explorer.on("error", error => {
        log("Machine", `explorer.exe could not be started to activate ${aumid}: ${describeError(error)}`);
    });
    explorer.on("spawn", () => {
        log("Machine", `explorer.exe shell:AppsFolder\\${aumid} started as pid ${explorer.pid ?? "unknown"}`);
    });
    explorer.unref();
}

/** Whether a process id Windows handed back is still alive, without disturbing it. */
function isAlive(pid: number): boolean {
    if (pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

/**
 * The activation result and the poll answer different questions and both are needed. The HRESULT
 * says whether Windows accepted the request; only the poll says whether a game is there, because
 * a process Windows created and that exited a moment later reports as a success.
 */
async function confirmStarted(
    aumid: string,
    versionPath: string,
    dataDir: string,
    pkg: Packages.RegisteredPackage,
    outcome: Activation.ActivationOutcome,
    launchedBy: string
): Promise<void> {
    const startedAt = Date.now();
    let probe: ProcessProbe = { processes: [], queryFailed: true, detail: "not checked yet" };

    while (Date.now() - startedAt < ACTIVATION_TIMEOUT_MS) {
        await sleep(ACTIVATION_POLL_MS);
        probe = await probeProcesses(GAME_EXECUTABLE);
        if (probe.queryFailed) continue;

        const started = probe.processes.find(
            p => p.executablePath === "" || samePath(path.dirname(p.executablePath), versionPath)
        );
        if (started) {
            const from = started.executablePath || "an image path Windows would not report";
            log("Machine", `${aumid} started as pid ${started.pid} from ${from}, via ${launchedBy}`);
            return;
        }
    }

    // Being unable to look is not evidence that the game failed to start, so it must not fail the launch.
    if (probe.queryFailed) {
        log(
            "Machine",
            `Activated ${aumid} via ${launchedBy}, but Windows could not be asked whether it started`
        );
        return;
    }

    const seen = probe.processes.length === 0
        ? "none"
        : probe.processes.map(p => `${p.pid} ${p.executablePath || "(image path unreadable)"}`).join("; ");

    const createdProcess = outcome.pid > 0
        ? `Windows created process ${outcome.pid}, which ${isAlive(outcome.pid) ? "is still running" : "has already exited"}`
        : "Windows created no process";

    const detail =
        `App id: ${aumid}\n`
        + `Started by: ${launchedBy}\n`
        + `Activation result: ${outcome.hresult || "none"} (${Activation.describeHresult(outcome.hresult)})\n`
        + `${createdProcess}\n`
        + `Expected build: ${versionPath}\n`
        + `Build holds: ${VersionFiles.describePayload(versionPath)}\n`
        + `Registered as: ${pkg.family} -> ${pkg.installPath}\n`
        + `Licence files in ${dataDir}: ${Licence.describeEntitlements(dataDir)}\n`
        + `Developer Mode: ${Packages.isDeveloperModeEnabled() ? "on" : "off"}\n`
        + `Sideloading blocked by this computer's policy: ${Packages.isSideloadingBlockedByPolicy() ? "yes" : "no"}\n`
        + `Minecraft processes running: ${seen}`;

    // Windows keeps its own account of the activation, and it is routinely the only place the
    // real reason is written down. A tester cannot be asked to go and read Event Viewer.
    const sinceSeconds = Math.round((Date.now() - startedAt) / 1000) + 30;
    const events = await Activation.recentAppModelEvents(sinceSeconds);

    logBlock("Machine", `${aumid} was activated but no Minecraft appeared`, detail);
    logBlock("Machine", `What Windows recorded in the last ${sinceSeconds} seconds`, events);

    throw new Error(
        `Minecraft did not start.\n\n`
        + `Windows accepted the request to open it, but no Minecraft was running `
        + `${Math.round(ACTIVATION_TIMEOUT_MS / 1000)} seconds later.\n\n`
        + detail
    );
}
