import { describeError } from "@shared/diagnostics/ProcessRunner";

const child = window.require("child_process") as typeof import("child_process");
const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");

const GAME_EXECUTABLE = "Minecraft.Windows.exe";

/** How long to wait for the game to write its entitlement before giving up. */
const ACQUIRE_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 250;

/** The game caches its entitlement as `<titleId>.ent` in its data folder. */
export function hasEntitlement(dataDir: string): boolean {
    try {
        return fs.readdirSync(dataDir).some(name => name.toLowerCase().endsWith(".ent"));
    } catch {
        return false;
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForExit(pid: number): Promise<void> {
    for (let waited = 0; waited < 10_000; waited += POLL_INTERVAL_MS) {
        try {
            process.kill(pid, 0);
        } catch {
            return;
        }
        await sleep(POLL_INTERVAL_MS);
    }
}

/**
 * Resolves once the process is running. A spawn failure arrives asynchronously, so without
 * this the caller would sit out the whole acquire timeout waiting for a game that was never
 * started, and node would tear the renderer down over the unhandled `error` event.
 */
async function startGame(executable: string, cwd: string): Promise<import("child_process").ChildProcess> {
    const proc = child.spawn(executable, [], { cwd, stdio: "ignore", windowsHide: true });

    // Attached before the race so a later failure still has a handler.
    proc.on("error", error => console.error(`[Licence] ${executable} reported an error: ${describeError(error)}`));

    await new Promise<void>((resolve, reject) => {
        proc.once("spawn", () => resolve());
        proc.once("error", error => reject(new Error(`Could not start ${executable}. ${describeError(error)}`)));
    });

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
    if (hasEntitlement(dataDir)) return;

    status("First run for this profile - acquiring a Minecraft licence...");
    console.log(`[Licence] No entitlement in ${dataDir}, bootstrapping via direct launch`);

    const executable = path.join(versionPath, GAME_EXECUTABLE);
    const proc = await startGame(executable, versionPath);
    if (proc.pid === undefined) throw new Error(`Could not start ${executable} to acquire a licence.`);

    try {
        for (let waited = 0; waited < ACQUIRE_TIMEOUT_MS; waited += POLL_INTERVAL_MS) {
            if (hasEntitlement(dataDir)) {
                console.log(`[Licence] Entitlement acquired after ${(waited / 1000).toFixed(1)}s`);
                return;
            }
            if (proc.exitCode !== null) {
                console.error(`[Licence] ${executable} exited with code ${proc.exitCode} before writing an entitlement`);
                break;
            }
            await sleep(POLL_INTERVAL_MS);
        }
    } finally {
        proc.kill();
        await waitForExit(proc.pid);
    }

    if (!hasEntitlement(dataDir)) {
        console.error(
            `[Licence] No .ent file in ${dataDir} after ${ACQUIRE_TIMEOUT_MS / 1000}s of running ${executable}`
        );
        throw new Error(
            "Could not acquire a Minecraft licence for this profile. Sign in to Minecraft or the Xbox app once, then try again."
        );
    }
}
