import { log } from "@renderer/scripts/LauncherLog";
import { ArchiveToolArtifact } from "./ToolArtifact";
import { LauncherTools } from "./LauncherTools";

const path = window.require("path") as typeof import("path");
const child = window.require("child_process") as typeof import("child_process");
const { shellEnv } = window.require("shell-env") as typeof import("shell-env");

/**
 * [UMU Launcher](https://github.com/raonygamer/umu-launcher) - a compatibility layer for running
 * Windows games on Linux via Proton.
 *
 * Supported platforms: **Linux** only.
 *
 * Typical usage:
 * ```ts
 * await LauncherTools.UMULauncher.runGame(gamePath, { WINEPREFIX: prefixPath });
 * ```
 */
export class UMULauncher extends ArchiveToolArtifact {
    constructor() {
        super({
            name: "umu-launcher",
            repository: "raonygamer/umu-launcher",
            executableName: "umu-run",
            platforms: ["linux"],
            permissions: 0o755,
            checkDefaults: {
                promptForUpdate: false,
                allowOutdated: true,
                releaseFetchTimeout: 1000,
                checkForUpdates: true,
            },
        });
    }

    /**
     * Launches a game through UMU Launcher.
     *
     * @param gamePath        Absolute path to the game executable (`.exe`).
     * @param envVars         Environment variables to pass to the process (e.g. `WINEPREFIX`, `PROTONPATH`).
     * @param checkForUpdates When `true`, checks GitHub for a newer UMU Launcher first.
     */
    async runGame(gamePath: string, envVars: Record<string, string>, checkForUpdates: boolean = false): Promise<void> {
        log(this.name, `Starting '${gamePath}' through Proton, checkForUpdates=${checkForUpdates}`);

        const { executable } = await this.check({ checkForUpdates });
        const { path: gdkProtonPath } = await LauncherTools.GDKProton.check({
            checkForUpdates,
        });

        const envs = await shellEnv();
        const env = {
            ...envs,
            ...envVars,
            PROTONPATH: gdkProtonPath,
        };

        // The launcher's own additions only. The inherited shell environment is not logged:
        // it is long and routinely carries tokens the user never meant to hand over.
        const ownEnv = { ...envVars, PROTONPATH: gdkProtonPath };
        log(
            this.name,
            `Spawning ${executable} ${gamePath} in ${path.dirname(gamePath)} with ` +
                `${Object.entries(ownEnv)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(", ")} ` +
                `on top of ${Object.keys(envs).length} inherited variables`
        );

        const proc = child.spawn(executable, [gamePath], {
            env: env,
            cwd: path.dirname(gamePath),
            stdio: ["ignore", "pipe", "pipe"],
            detached: true,
        });

        // Piped output has to be read. Left unread the pipe fills and the game blocks on its own
        // logging. Left on console rather than log(): it is the game's own stream, line by line,
        // and the console shim records it either way.
        proc.stdout?.on("data", data => console.log(`[${this.name}] ${data.toString().trimEnd()}`));
        proc.stderr?.on("data", data => console.error(`[${this.name}] ${data.toString().trimEnd()}`));

        proc.on("error", err => log(this.name, `${executable} reported an error: ${err.message}`));
        proc.on("close", (code, signal) => {
            log(this.name, `${gamePath} exited with code ${code}, signal ${signal}`);
        });

        // A spawn failure arrives asynchronously, so without this wait the launch would report
        // success for a game that never started.
        await new Promise<void>((resolve, reject) => {
            proc.once("spawn", () => resolve());
            proc.once("error", error => {
                log(this.name, `${executable} could not be started: ${error.message}`);
                reject(new Error(`Could not start ${executable}. ${error.message}`));
            });
        });

        proc.unref();
        log(this.name, `${gamePath} started as pid ${proc.pid ?? "unknown"}, detached from the launcher`);
    }
}
