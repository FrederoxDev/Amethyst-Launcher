import { Channel } from "@renderer/scripts/domain/Channel";
import { log } from "@renderer/scripts/LauncherLog";
import { describeError, describeResult, readMarker, runPowerShell } from "@shared/diagnostics/ProcessRunner";
import { ForeignGameDataError, ProcessInfo, SystemSetupRequiredError } from "../LauncherPlatform";
import * as DataLink from "./DataLink";
import * as Packages from "./Packages";
import * as VersionFiles from "./VersionFiles";

const child = window.require("child_process") as typeof import("child_process");
const path = window.require("path") as typeof import("path");

export const GAME_EXECUTABLE = "Minecraft.Windows.exe";

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
        console.error(`[Machine] Could not ask Windows which ${executableName} processes are running.\n${detail}`);
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
            console.error(`[Machine] Unreadable process line for ${executableName}: ${trimmed}`);
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
    return { processes, queryFailed: false, detail };
}

function reconcileDataLink(desired: DesiredState, status: (m: string) => void): void {
    const state = DataLink.readLink(desired.channel);

    switch (state.kind) {
        case "blocked-by-file":
            throw new Error(
                `"${DataLink.roamingPath(desired.channel)}" is a file, not a folder. Remove or rename it.`
            );

        case "foreign-data":
            throw new ForeignGameDataError(desired.channel, DataLink.roamingPath(desired.channel));

        case "linked":
            if (samePath(state.target, desired.dataDir)) return;
            status("Switching game data to this profile...");
            DataLink.unlink(desired.channel);
            break;

        case "empty-dir":
            status("Linking game data to this profile...");
            DataLink.removeEmptyDir(desired.channel);
            break;

        case "absent":
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
    if (failure.blocker === "sideloading-policy") {
        throw new Error(
            "This computer's settings do not allow Minecraft to be set up, and the block is managed by "
            + "whoever administers it, so the launcher cannot change it. If this is a work or school "
            + "computer, its administrator has to allow app sideloading.\n\n"
            + `(${failure.detail})`
        );
    }

    if (failure.blocker === "developer-mode") {
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
        status("Waiting for Windows to release the previous Minecraft...");
        await new Promise(resolve => setTimeout(resolve, 4000));
        try {
            await Packages.register(desired.versionPath);
            return;
        } catch (e) {
            if (!(e instanceof Packages.PackageRegistrationError)) throw e;
            throw new Error(
                "Minecraft is still open, or Windows has not finished closing it.\n\n"
                + "Close Minecraft, wait a few seconds, then press Launch again.\n\n"
                + `(${e.detail})`
            );
        }
    }

    if (failure.blocker === "conflicting-registration") {
        status("Removing a conflicting Minecraft registration...");
        try {
            await Packages.unregister(packageFamilyFor(desired.versionPath));
        } catch (e) {
            log("Machine", `Could not clear the conflicting registration: ${(e as Error).message}`);
        }

        status("Registering Minecraft...");
        try {
            await Packages.register(desired.versionPath);
            return;
        } catch (e) {
            if (!(e instanceof Packages.PackageRegistrationError)) throw e;
            throw new Error(
                `Minecraft could not be set up on this computer.\n\n${e.message}\n\n(${e.detail})`
            );
        }
    }

    throw new Error(
        `Minecraft could not be set up on this computer.\n\n${failure.message}\n\n(${failure.detail})`
    );
}

/** Touches only this build's own family; another channel's registration is never disturbed. */
async function reconcilePackage(desired: DesiredState, status: (m: string) => void): Promise<void> {
    const wantFamily = packageFamilyFor(desired.versionPath).toLowerCase();
    const sameFamily = Packages.listRegistered().filter(pkg => pkg.family.toLowerCase() === wantFamily);

    if (sameFamily.some(pkg => samePath(pkg.installPath, desired.versionPath))) return;

    // Best effort: a stale entry that will not come off is not itself fatal, because the
    // registration below is verified either way.
    for (const pkg of sameFamily) {
        status(`Unregistering ${pkg.family}...`);
        try {
            await Packages.unregister(pkg.family);
        } catch (e) {
            log("Machine", `Could not unregister ${pkg.family}, continuing: ${(e as Error).message}`);
        }
    }

    status("Registering Minecraft...");
    try {
        await Packages.register(desired.versionPath);
    } catch (e) {
        if (!(e instanceof Packages.PackageRegistrationError)) throw e;
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

    // Cheap and reversible first, invasive last.
    reconcileDataLink(desired, status);
    await VersionFiles.ensureVersionFiles(desired.versionPath, desired.channel, status);

    if (desired.proxy) {
        if (!VersionFiles.isProxyCurrent(desired.versionPath)) {
            status("Installing runtime proxy...");
            VersionFiles.installProxy(desired.versionPath);
        }
    } else if (VersionFiles.isProxyPresent(desired.versionPath)) {
        status("Removing runtime proxy...");
        VersionFiles.removeProxy(desired.versionPath);
    }

    await reconcilePackage(desired, status);
}

/** Where the channel's data folder currently points, or null if it isn't linked. */
export function currentDataTarget(channel: Channel): string | null {
    const state = DataLink.readLink(channel);
    return state.kind === "linked" ? state.target : null;
}

export function unlinkChannel(channel: Channel): void {
    if (DataLink.readLink(channel).kind === "linked") DataLink.unlink(channel);
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
export async function activate(versionPath: string, onStatus?: (m: string) => void): Promise<void> {
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

    const explorer = child.spawn("explorer.exe", [`shell:AppsFolder\\${aumid}`], {
        detached: true,
        stdio: "ignore",
    });
    explorer.on("error", error => {
        console.error(`[Machine] explorer.exe could not be started to activate ${aumid}: ${describeError(error)}`);
    });
    explorer.unref();

    status("Waiting for Minecraft to start...");
    await confirmStarted(aumid, versionPath, pkg);
}

/**
 * explorer.exe hands the activation off and exits 0 whether or not the AUMID resolved, so its
 * exit says nothing. A wrong `<Application Id>`, a registration pointing at another build and a
 * missing entitlement all look identical from here - the only honest check is whether the game
 * turned up.
 */
async function confirmStarted(
    aumid: string,
    versionPath: string,
    pkg: Packages.RegisteredPackage
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
            log("Machine", `${aumid} started as pid ${started.pid} from ${from}`);
            return;
        }
    }

    // Being unable to look is not evidence that the game failed to start, so it must not fail the launch.
    if (probe.queryFailed) {
        log("Machine", `Activated ${aumid}, but Windows could not be asked whether it started`);
        return;
    }

    const seen = probe.processes.length === 0
        ? "none"
        : probe.processes.map(p => `${p.pid} ${p.executablePath || "(image path unreadable)"}`).join("; ");

    const detail =
        `App id: ${aumid}\n`
        + `Expected build: ${versionPath}\n`
        + `Registered as: ${pkg.family} -> ${pkg.installPath}\n`
        + `Developer Mode: ${Packages.isDeveloperModeEnabled() ? "on" : "off"}\n`
        + `Sideloading blocked by this computer's policy: ${Packages.isSideloadingBlockedByPolicy() ? "yes" : "no"}\n`
        + `Minecraft processes running: ${seen}`;

    console.error(`[Machine] ${aumid} was activated but no Minecraft appeared.\n${detail}`);
    throw new Error(
        `Minecraft did not start.\n\n`
        + `Windows accepted the request to open it, but no Minecraft was running `
        + `${Math.round(ACTIVATION_TIMEOUT_MS / 1000)} seconds later.\n\n`
        + detail
    );
}
