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
 * [UMU Launcher](https://github.com/raonygamer/umu-launcher) – a compatibility
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
        console.log(`[${this.name}] isSupported() → ${supported} (platform='${window.process.platform}').`);
        return supported;
    }

    /**
     * Overrides the base `check()` to supply UMU Launcher-specific defaults:
     * - `promptForUpdate`: `false` – always auto-update without prompting.
     * - `allowOutdated`: `true` – tolerate an older version when GitHub is unreachable.
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
        console.log(`[${this.name}] getExecutableName() → 'umu-run'.`);
        return "umu-run";
    }

    /**
     * Returns the first available release asset. UMU Launcher releases ship
     * a single archive per release.
     */
    protected async findAsset(release: GithubRelease): Promise<GithubAsset | null> {
        console.log(`[${this.name}] Searching release assets. Total assets: ${release.assets.length}.`);
        const asset = release.assets[0] ?? null;
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
        console.log(`[${this.name}] onInstalled: version='${context.version}', action='${context.action}'.`);
        const folder = this.getFolder();
        console.log(`[${this.name}] Applying chmod 755 recursively to '${folder}'.`);
        await PathUtils.chmodRecursive(folder, 0o755);
    }

    /**
     * Launches a game through UMU Launcher.
     *
     * @param gamePath        Absolute path to the game executable (`.exe`).
     * @param envVars         Environment variables to pass to the process (e.g. `WINEPREFIX`, `PROTONPATH`).
     * @param shouldAskUpdate When `true`, prompts the user before updating UMU Launcher.
     */
    async runGame(gamePath: string, envVars: Record<string, string>, checkForUpdates: boolean = false): Promise<void> {
        console.log(`[${this.name}] runGame() called. gamePath='${gamePath}', checkForUpdates=${checkForUpdates}.`);

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

        const exec_proc = child.spawn(executable, [`${gamePath}`], {
            env: env,
            cwd: path.dirname(gamePath),
            stdio: ["ignore", "pipe", "pipe"],
            detached: true
        });

        // exec_proc.stdout?.on("data", (data) => {
        //     console.log(`[${this.name}] STDOUT] ${data}`);
        // });

        // exec_proc.stderr?.on("data", (data) => {
        //     console.log(`[${this.name}] STDERR] ${data}`);
        // });

        exec_proc.on("error", (err) => {
            console.error(`[${this.name}] Failed to run game:`, err);
        });

        exec_proc.on("close", (code) => {
            console.log(`[${this.name}] Game process exited with code ${code}.`);
        });

        exec_proc.unref();
        console.log(`[${this.name}] Game process spawned (detached). PID: ${exec_proc.pid ?? "unknown"}.`);
    }
}