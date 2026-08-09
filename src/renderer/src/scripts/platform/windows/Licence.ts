import { log } from "@renderer/scripts/LauncherLog";
import { describeError } from "@shared/diagnostics/ProcessRunner";

const child = window.require("child_process") as typeof import("child_process");
const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");

const GAME_EXECUTABLE = "Minecraft.Windows.exe";

/** How long to wait for the game to write its entitlement before giving up. */
const ACQUIRE_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 250;

/**
 * The game caches its entitlement as `<titleId>.ent` in its data folder. The files themselves and
 * not just a yes/no, because an entitlement that came in with adopted data from a different
 * install is the one case where the file is present and the licence behind it may not be.
 */
/**
 * Deduped, because this is polled four times a second while a licence is being acquired and a
 * missing data folder would otherwise write the same line five hundred times.
 */
const reportedReadFailures = new Set<string>();

export function entitlementFiles(dataDir: string): string[] {
    try {
        return fs.readdirSync(dataDir).filter(name => name.toLowerCase().endsWith(".ent"));
    } catch (e) {
        const key = `${dataDir}|${describeError(e)}`;
        if (!reportedReadFailures.has(key)) {
            reportedReadFailures.add(key);
            log("Licence", `${dataDir} could not be listed, so it counts as unentitled: ${describeError(e)}`);
        }
        return [];
    }
}

/** Each `.ent` with its size and when it was written, which is what says where it came from. */
export function describeEntitlements(dataDir: string): string {
    const files = entitlementFiles(dataDir);
    if (files.length === 0) return "none";

    return files
        .map(name => {
            try {
                const stat = fs.statSync(path.join(dataDir, name));
                return `${name} (${stat.size} bytes, written ${stat.mtime.toISOString()})`;
            } catch (e) {
                return `${name} (unreadable: ${describeError(e)})`;
            }
        })
        .join(", ");
}

function hasEntitlement(dataDir: string): boolean {
    return entitlementFiles(dataDir).length > 0;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const EXIT_WAIT_MS = 10_000;

async function waitForExit(pid: number): Promise<void> {
    for (let waited = 0; waited < EXIT_WAIT_MS; waited += POLL_INTERVAL_MS) {
        try {
            process.kill(pid, 0);
        } catch {
            log("Licence", `Licence-acquisition process ${pid} exited after ${(waited / 1000).toFixed(1)}s`);
            return;
        }
        await sleep(POLL_INTERVAL_MS);
    }
    log(
        "Licence",
        `Licence-acquisition process ${pid} was still running ${EXIT_WAIT_MS / 1000}s after being asked to close; `
        + `carrying on, but it may hold the package registration`
    );
}

/**
 * Resolves once the process is running. A spawn failure arrives asynchronously, so without
 * this the caller would sit out the whole acquire timeout waiting for a game that was never
 * started, and node would tear the renderer down over the unhandled `error` event.
 */
async function startGame(executable: string, cwd: string): Promise<import("child_process").ChildProcess> {
    log("Licence", `Starting ${executable} directly (no package identity) in ${cwd}`);
    const proc = child.spawn(executable, [], { cwd, stdio: "ignore", windowsHide: true });

    // Attached before the race so a later failure still has a handler.
    proc.on("error", error => log("Licence", `${executable} reported an error: ${describeError(error)}`));
    proc.on("exit", (code, signal) => {
        log("Licence", `${executable} (pid ${proc.pid ?? "unknown"}) exited with code ${code}, signal ${signal}`);
    });

    await new Promise<void>((resolve, reject) => {
        proc.once("spawn", () => resolve());
        proc.once("error", error => {
            log("Licence", `${executable} could not be started: ${describeError(error)}`);
            reject(new Error(
                "Minecraft could not be started to sign this profile in.\n\n"
                + "Antivirus software blocking Minecraft is the most common cause, so allow the launcher's "
                + "Versions folder in it. Then press Play again."
            ));
        });
    });

    log("Licence", `${executable} started as pid ${proc.pid ?? "unknown"}`);
    return proc;
}

/**
 * Gives a profile's data folder the entitlement that package activation requires.
 *
 * Package activation is mandatory for mods - only a package-identity process resolves
 * the dxgi proxy out of the build folder instead of System32 - but it refuses to run
 * without a cached entitlement, exiting instantly and writing nothing. A direct exe
 * launch has no package identity and therefore no licence check, so it can acquire one.
 * This runs the game just long enough to do that, then stops it.
 */
export async function ensureEntitlement(
    versionPath: string,
    dataDir: string,
    status: (message: string) => void
): Promise<void> {
    if (hasEntitlement(dataDir)) {
        log("Licence", `Already entitled, skipping: ${dataDir} holds ${describeEntitlements(dataDir)}`);
        return;
    }

    status("First run for this profile - acquiring a Minecraft licence...");
    log("Licence", `No entitlement in ${dataDir}, bootstrapping via direct launch`);

    const executable = path.join(versionPath, GAME_EXECUTABLE);
    const proc = await startGame(executable, versionPath);
    if (proc.pid === undefined) {
        log("Licence", `${executable} spawned without a pid, so it cannot be waited on or stopped`);
        throw new Error(
            "Minecraft could not be started to sign this profile in.\n\n"
            + "Restart the computer and press Play again."
        );
    }

    let waited = 0;
    let crashed = false;
    let stopped = "the wait ran out";

    try {
        for (; waited < ACQUIRE_TIMEOUT_MS; waited += POLL_INTERVAL_MS) {
            if (hasEntitlement(dataDir)) {
                stopped = "an entitlement appeared";
                log("Licence", `Entitlement acquired after ${(waited / 1000).toFixed(1)}s: ${describeEntitlements(dataDir)}`);
                return;
            }
            if (proc.exitCode !== null) {
                crashed = true;
                stopped = `the game exited with code ${proc.exitCode}`;
                log("Licence", `${executable} exited with code ${proc.exitCode} before writing an entitlement`);
                break;
            }
            await sleep(POLL_INTERVAL_MS);
        }
    } finally {
        log("Licence", `Stopping pid ${proc.pid} after ${(waited / 1000).toFixed(1)}s (${stopped})`);
        proc.kill();
        await waitForExit(proc.pid);
    }

    if (!hasEntitlement(dataDir)) {
        log(
            "Licence",
            `No .ent file in ${dataDir} after ${(waited / 1000).toFixed(1)}s of running ${executable} `
            + `(waited for any *.ent to appear, up to ${ACQUIRE_TIMEOUT_MS / 1000}s; ${stopped}). `
            + `Folder holds: ${describeEntitlements(dataDir)}`
        );
        // Two different problems: a game that closed itself is a crash and belongs to the game or
        // its mods, while a game that stayed up and wrote nothing is waiting for a sign-in.
        throw new Error(
            crashed
                ? "Minecraft closed itself while the launcher was signing this profile in.\n\n"
                    + "This is a crash in the game or in one of its mods. Open Logs and read the newest Minecraft "
                    + "log for the reason. If this profile uses mods, turn them off one at a time in the profile "
                    + "editor to find which one crashes."
                : "This profile could not be signed in to Minecraft.\n\n"
                    + "Open Minecraft from the Start menu once and sign in with your Microsoft account, then come "
                    + "back and press Play."
        );
    }

    log("Licence", `Entitlement present after the run was stopped: ${describeEntitlements(dataDir)}`);
}
