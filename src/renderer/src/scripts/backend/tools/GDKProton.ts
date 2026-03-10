import { PathUtils } from "../../PathUtils";
import { GithubRelease } from "../github/GithubRelease";
import { GithubAsset } from "../github/GithubAsset";
import { CheckAction, DefaultCheckOptions, ToolArtifact, ToolCheckResult, ToolInstalledContext } from "./ToolArtifact";

/**
 * Concrete {@link ToolArtifact} implementation for
 * [GDK Proton](https://github.com/raonygamer/gdk-proton) – a Proton build
 * tailored for running GDK games on Linux.
 *
 * Supported platforms: **Linux** only.
 *
 * Typical usage:
 * ```ts
 * const gdkProton = new GDKProton("gdk-proton", "raonygamer/gdk-proton");
 * const { path: protonPath } = await gdkProton.check();
 * ```
 */
export class GDKProton extends ToolArtifact {
    readonly name: string = "gdk-proton";
    /** GitHub repository that hosts GDK Proton releases. */
    readonly repository: string = "raonygamer/gdk-proton";

    /**
     * GDK Proton only ships builds for Linux.
     */
    isSupported(): boolean {
        const supported = window.process.platform === "linux";
        console.log(`[${this.name}] isSupported() → ${supported} (platform='${window.process.platform}').`);
        return supported;
    }

    /**
     * Overrides the base `check()` to supply GDK Proton-specific defaults:
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
     * Returns the executable filename (`proton`).
     */
    protected getExecutableName(): string {
        console.log(`[${this.name}] getExecutableName() → 'proton'.`);
        return "proton";
    }

    /**
     * Returns the first available release asset. GDK Proton releases ship
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
}