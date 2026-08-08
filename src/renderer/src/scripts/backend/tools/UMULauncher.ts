import { log } from "@renderer/scripts/LauncherLog";
import { PathUtils } from "@renderer/scripts/PathUtils";
import { GithubRelease } from "../github/GithubRelease";
import { GithubAsset } from "../github/GithubAsset";
import { CheckAction, DefaultCheckOptions, ToolArtifact, ToolCheckResult, ToolInstalledContext } from "./ToolArtifact";
import { LauncherTools } from "./LauncherTools";

const path = window.require("path") as typeof import("path");
const child = window.require("child_process") as typeof import("child_process");
const { shellEnv } = window.require("shell-env") as typeof import("shell-env");

/**
 * Concrete {@link ToolArtifact} implementation for
 * [UMU Launcher](https://github.com/raonygamer/umu-launcher) - a compatibility
 * layer for running Windows games on Linux via Proton.
 *
 * Supported platforms: **Linux** only.
 *
 * Typical usage:
 * ```ts
 * const umu = new UMULauncher("umu-launcher", "raonygamer/umu-launcher");
 * await umu.runGame(gamePath, { WINEPREFIX: prefixPath, PROTONPATH: protonPath });
 * ```
 */
export class UMULauncher extends ToolArtifact {
    readonly name: string = "umu-launcher";
    /** GitHub repository that hosts UMU Launcher releases. */
    readonly repository: string = "raonygamer/umu-launcher";

    /**
     * UMU Launcher only ships binaries for Linux.
     */
    isSupported(): boolean {
        const supported = window.process.platform === "linux";
        if (!supported) log(this.name, `Not supported on platform '${window.process.platform}', Linux only`);
        return supported;
    }

    /**
     * Overrides the base `check()` to supply UMU Launcher-specific defaults:
     * - `promptForUpdate`: `false` - always auto-update without prompting.
     * - `allowOutdated`: `true` - tolerate an older version when GitHub is unreachable.
     * - `releaseFetchTimeout`: `1000` ms.
     */
    check(options?: DefaultCheckOptions | undefined): Promise<ToolCheckResult> {
        const resolvedOptions = {
            promptForUpdate: options?.promptForUpdate ?? false,
            allowOutdated: options?.allowOutdated ?? true,
            releaseFetchTimeout: options?.releaseFetchTimeout ?? 1000,
            checkForUpdates: options?.checkForUpdates ?? true
        };
        return super.check(resolvedOptions);
    }

    /** The installation folder is simply named after the tool. */
    protected getFolderName(): string {
        return this.name;
    }

    /**
     * Returns the executable filename (`umu-run`).
     */
    protected getExecutableName(): string {
        return "umu-run";
    }

    /**
     * Returns the first available release asset. UMU Launcher releases ship
     * a single archive per release.
     */
    protected async findAsset(release: GithubRelease): Promise<GithubAsset | null> {
        const asset = release.assets[0] ?? null;
        log(
            this.name,
            asset
                ? `Taking the first asset of release ${release.tagName}: '${asset.name}' of ${release.assets.length}`
                : `Release ${release.tagName} ships no assets`
        );
        return asset;
    }

    /**
     * Compares two version tags using simple string equality.
     *
     * @returns `-1` if `current` is missing or differs from `latest`, `0` if equal.
     */
    protected compareTags(current: string | null, latest: string): number {
        if (!current) {
            return -1;
        }
        const result = current === latest ? 0 : -1;
        return result;
    }

    /** Builds the standard {@link ToolCheckResult} returned by `check()`. */
    protected buildResult(version: string, toolPath: string, executable: string, action: CheckAction): ToolCheckResult {
        return {
            version,
            path: toolPath,
            executable,
            action
        };
    }

    /**
     * Post-install hook: recursively marks all extracted files as executable
     * (`chmod 755`) since GitHub release archives may not preserve permissions.
     */
    protected async onInstalled(context: ToolInstalledContext): Promise<void> {
        const folder = this.getFolder();
        log(this.name, `${context.action} '${context.version}', marking everything in '${folder}' executable`);
        try {
            await PathUtils.chmodRecursive(folder, 0o755);
        } catch (error) {
            log(this.name, `chmod 755 across '${folder}' failed: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Launches a game through UMU Launcher.
     *
     * @param gamePath        Absolute path to the game executable (`.exe`).
     * @param envVars         Environment variables to pass to the process (e.g. `WINEPREFIX`, `PROTONPATH`).
     * @param shouldAskUpdate When `true`, prompts the user before updating UMU Launcher.
     */
    async runGame(gamePath: string, envVars: Record<string, string>, checkForUpdates: boolean = false): Promise<void> {
        log(this.name, `Starting '${gamePath}' through Proton, checkForUpdates=${checkForUpdates}`);

        const { executable } = await this.check({
            allowOutdated: true,
            promptForUpdate: false,
            releaseFetchTimeout: 1000,
            checkForUpdates: true
        });

        const { path: gdkProtonPath } = await LauncherTools.GDKProton.check({
            allowOutdated: true,
            promptForUpdate: false,
            releaseFetchTimeout: 1000,
            checkForUpdates: true
        });

        const envs = await shellEnv();
        const env = {
            ...envs,
            ...envVars,
            "PROTONPATH": gdkProtonPath
        };

        // The launcher's own additions only. The inherited shell environment is not logged:
        // it is long and routinely carries tokens the user never meant to hand over.
        const ownEnv = { ...envVars, PROTONPATH: gdkProtonPath };
        log(
            this.name,
            `Spawning ${executable} ${gamePath} in ${path.dirname(gamePath)} with `
            + `${Object.entries(ownEnv).map(([k, v]) => `${k}=${v}`).join(", ")} `
            + `on top of ${Object.keys(envs).length} inherited variables`
        );

        const proc = child.spawn(executable, [gamePath], {
            env: env,
            cwd: path.dirname(gamePath),
            stdio: ["ignore", "pipe", "pipe"],
            detached: true
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