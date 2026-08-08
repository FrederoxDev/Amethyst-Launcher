import { log } from "@renderer/scripts/LauncherLog";
import { useAppStore } from "@renderer/states/AppStore";
import { describeError } from "@shared/diagnostics/ProcessRunner";
import { GithubAsset } from "../github/GithubAsset";
import { GithubRelease } from "../github/GithubRelease";
import { GithubTools } from "../github/GithubTools";
import { ProgressBar } from "@renderer/states/ProgressBarStore";
import { Downloader } from "../Downloader";
import { Extractor } from "../Extractor";
import { PathUtils } from "@renderer/scripts/PathUtils";
import ToolUpdatePopup from "@renderer/popups/ToolUpdatePopup";
import { Popup } from "@renderer/states/PopupStore";

const path = window.require("path") as typeof import("path");
const fs = window.require("fs") as typeof import("fs");

/**
 * Describes the outcome of a `check()` call on a tool artifact.
 * - `"installed"` - the tool was freshly installed (was not present before).
 * - `"updated"` - the tool was already installed and has just been updated.
 * - `"update_skipped"` - an update was available but the user declined it.
 * - `"up_to_date"` - the installed version is already the latest.
 */
export type CheckAction = "installed" | "updated" | "update_skipped" | "up_to_date";

/**
 * Options controlling how {@link ToolArtifact.check} behaves.
 */
export interface DefaultCheckOptions {
    /** When `true`, shows a prompt asking the user whether to update. */
    promptForUpdate: boolean;
    /** When `true`, allows the tool to be used even if it is behind the latest release. */
    allowOutdated: boolean;
    /** Milliseconds to wait before aborting the GitHub release fetch. */
    releaseFetchTimeout: number;
    /**
     * When `false` (default) and the tool is already installed, skips the
     * GitHub release fetch entirely and returns the current version immediately.
     * When `true`, performs the full version check and update flow.
     */
    checkForUpdates: boolean;
}

/**
 * The value returned by a successful {@link ToolArtifact.check} call.
 */
export interface ToolCheckResult {
    /** Installed/verified version tag (e.g. `"1.2.3"`). */
    version: string;
    /** Absolute path to the tool executable. */
    executable: string;
    /** Absolute path to the tool installation folder. */
    path: string;
    /** What action was taken to reach this state. */
    action: CheckAction;
}

/**
 * Generic interface that all tool artifact implementations must satisfy.
 * @template TCheckOptions  Options accepted by `check()`.
 * @template TCheckResult   Shape of the value resolved by `check()`.
 */
export interface IToolArtifact<TCheckOptions = DefaultCheckOptions, TCheckResult = ToolCheckResult> {
    /** Human-readable name of the tool (e.g. `"XVDTool"`). */
    readonly name: string;
    /** GitHub repository slug in `"owner/repo"` format. */
    readonly repository: string;

    /**
     * Ensures the tool is installed (and optionally up-to-date), then returns
     * metadata about the installed version.
     */
    check(options?: TCheckOptions): Promise<TCheckResult>;
    /** Returns `true` when the tool can run on the current platform/arch. */
    isSupported(): boolean;
}

/**
 * Payload passed to {@link ToolArtifact.onInstalled} after a successful
 * install or update.
 */
export interface ToolInstalledContext {
    /** The version tag that was just installed. */
    version: string;
    /** Whether this was a fresh install or an update. */
    action: CheckAction;
}

/**
 * Abstract base class for tools that are downloaded from GitHub Releases and
 * cached on disk. Subclasses only need to implement a handful of abstract
 * methods to describe platform-specific details (executable name, asset
 * selection, version comparison, and so on).
 *
 * @template TCheckOptions  Must extend {@link DefaultCheckOptions}.
 * @template TCheckResult   Must extend {@link ToolCheckResult}.
 */
export abstract class ToolArtifact<
    TCheckOptions extends DefaultCheckOptions = DefaultCheckOptions, 
    TCheckResult extends ToolCheckResult = ToolCheckResult
> implements IToolArtifact<TCheckOptions, TCheckResult> {
    readonly name: string;
    readonly repository: string;

    constructor(name: string, repository: string) {
        this.name = name;
        this.repository = repository;
        console.log(`[ToolArtifact] Initialized tool '${name}' from repository '${repository}'.`);
    }

    /**
     * Main entry point. Checks whether the tool is installed and up-to-date,
     * downloading / updating it as needed.
     *
     * Flow:
     * 1. Guard - reject unsupported platforms early.
     * 2. Read currently installed version from disk.
     * 3. Fetch the latest GitHub release (subject to timeout).
     * 4. Compare versions; skip the download when already current.
     * 5. Optionally prompt the user before updating.
     * 6. Remove old installation, download archive, extract.
     * 7. Write new version file and fire {@link onInstalled}.
     */
    async check(options?: TCheckOptions): Promise<TCheckResult> {
        log(
            this.name,
            `check() for ${this.repository}: checkForUpdates=${options?.checkForUpdates ?? false}, `
            + `promptForUpdate=${options?.promptForUpdate ?? false}, allowOutdated=${options?.allowOutdated ?? false}, `
            + `releaseFetchTimeout=${options?.releaseFetchTimeout ?? "default"}ms`
        );

        // Reject unsupported platforms before doing any disk/network I/O.
        if (!this.isSupported()) {
            const msg = `${this.name} is not supported on this platform.`;
            log(this.name, `${msg} (platform ${window.process.platform}, arch ${window.process.arch})`);
            throw new Error(msg);
        }

        const toolPath = this.getFolder();
        PathUtils.ValidatePath(toolPath);
        const executable = this.getExecutable();

        // Read the version that is currently installed (may be null if not yet installed).
        const currentVersion = await this.getCurrentVersion();
        const isInstalled = currentVersion !== null;
        log(
            this.name,
            `Installed version is ${currentVersion ?? "none"}; folder '${toolPath}', executable '${executable}'`
        );

        // If already installed and the caller does not need an update check, return immediately.
        if (isInstalled && !options?.checkForUpdates) {
            log(this.name, `Already installed at '${currentVersion}' and no update check was asked for, skipping GitHub`);
            return this.buildResult(currentVersion!, toolPath, executable, "up_to_date");
        }

        // Attempt to fetch the latest release from GitHub.
        let latestRelease: GithubRelease | null = null;
        try {
            latestRelease = await this.fetchLatestRelease(options?.releaseFetchTimeout);
        } catch (error) {
            // If the tool is already installed and the caller allows an outdated
            // version, return the current installation rather than throwing.
            if (isInstalled && options?.allowOutdated) {
                log(
                    this.name,
                    `GitHub could not be read, carrying on with the installed '${currentVersion}': ${describeError(error)}`
                );
                return this.buildResult(currentVersion!, toolPath, executable, "up_to_date");
            }
            log(
                this.name,
                `GitHub could not be read and there is no usable installation to fall back on `
                + `(installed ${currentVersion ?? "none"}, allowOutdated ${options?.allowOutdated ?? false}): `
                + `${describeError(error)}`
            );
            throw error;
        }

        // Locate the release asset that matches the current platform/arch.
        const asset = await this.findAsset(latestRelease);
        if (!asset) {
            const msg = `No suitable asset found for the latest release of ${this.name}.`;
            log(
                this.name,
                `${msg} Release ${latestRelease.tagName} offers: `
                + `${latestRelease.assets.map(a => a.name).join(", ") || "no assets"} `
                + `(looking for platform ${window.process.platform}, arch ${window.process.arch})`
            );
            throw new Error(msg);
        }

        const latestTag = latestRelease.tagName;
        const compareResult = this.compareTags(currentVersion, latestTag);
        log(
            this.name,
            `Latest is '${latestTag}' with asset '${asset.name}'; installed '${currentVersion ?? "none"}' `
            + `compares ${compareResult}`
        );

        // Already on the latest (or newer) version, nothing to do.
        if (compareResult >= 0 && isInstalled) {
            log(this.name, `Installed '${currentVersion}' is not behind '${latestTag}', leaving it alone`);
            return this.buildResult(currentVersion!, toolPath, executable, "up_to_date");
        }

        // An update is available. Ask the user if required.
        if (isInstalled) {
            const shouldUpdate = options?.promptForUpdate
                ? await this.promptUpdate(currentVersion!, latestTag)
                : true;

            if (!shouldUpdate) {
                if (options?.allowOutdated) {
                    log(this.name, `Update to '${latestTag}' declined, carrying on with '${currentVersion}'`);
                    return this.buildResult(currentVersion!, toolPath, executable, "update_skipped");
                }
                const msg = `${this.name} is outdated and update was declined.`;
                log(this.name, `Update to '${latestTag}' declined and '${currentVersion}' is not allowed to be used`);
                throw new Error(msg);
            }

            log(this.name, `Updating from '${currentVersion}' to '${latestTag}'`);
            await this.onBeforeUpdate();
        } else {
            log(this.name, `Installing '${latestTag}' for the first time`);
        }

        // Wipe the existing installation folder so the extract is clean.
        try {
            await fs.promises.rm(toolPath, { recursive: true, force: true });
        } catch (error) {
            log(this.name, `Could not clear '${toolPath}' before installing '${latestTag}': ${describeError(error)}`);
            throw error;
        }

        // Download the release archive next to the tool folder.
        const archivePath = toolPath + path.extname(asset.name);
        await this.download(asset, archivePath, latestTag);

        // Extract the archive into the tool folder. Throws if any entry failed.
        try {
            await this.extract(archivePath, toolPath, latestTag);
            await this.assertInstallUsable(latestTag);
        } catch (error) {
            // version.txt is deliberately not written, and the half-installed folder is dropped,
            // so the next check() re-downloads instead of trusting a broken tool forever.
            log(this.name, `Install of '${latestTag}' failed, removing '${toolPath}': ${describeError(error)}`);
            await fs.promises.rm(toolPath, { recursive: true, force: true }).catch(cleanupError => {
                log(this.name, `Could not remove '${toolPath}': ${describeError(cleanupError)}`);
            });
            throw error;
        }

        const action: CheckAction = isInstalled ? "updated" : "installed";

        // Allow subclasses to run post-install logic (e.g. chmod on Linux).
        await this.onInstalled({ version: latestTag, action });

        // Persist the version so subsequent check() calls can skip redundant installs.
        await this.writeVersionFile(latestTag);
        log(this.name, `${this.name} ${action} at '${latestTag}' in '${toolPath}'`);

        return this.buildResult(latestTag, toolPath, executable, action);
    }

    /** Returns `true` when this tool can run on the current platform and architecture. */
    abstract isSupported(): boolean;

    /** Subdirectory name inside the tools root where this tool is installed. */
    protected abstract getFolderName(): string;

    /** Filename of the tool's main executable (including extension if any). */
    protected abstract getExecutableName(): string;

    /**
     * Inspects the assets of a GitHub release and returns the one that matches
     * the current platform/arch, or `null` if none are suitable.
     */
    protected abstract findAsset(release: GithubRelease): Promise<GithubAsset | null>;

    /**
     * Compares two version tags.
     * @returns Negative if `current` is older, 0 if equal, positive if newer.
     */
    protected abstract compareTags(current: string | null, latest: string): number;

    /**
     * Constructs the {@link TCheckResult} object returned by `check()`.
     * Kept abstract so subclasses can add extra fields.
     */
    protected abstract buildResult(
        version: string,
        path: string,
        executable: string,
        action: CheckAction
    ): TCheckResult;
    
    /** Returns the absolute path to the tool's installation folder. */
    getFolder(): string {
        const toolsPath = this.getToolsPath();
        return path.join(toolsPath, this.getFolderName());
    }
    
    /** Returns the absolute path to the tool executable. */
    getExecutable(): string {
        return path.join(this.getFolder(), this.getExecutableName());
    }
    
    /** Returns the absolute path to the `version.txt` file that tracks the installed version. */
    getVersionFile() {
        return path.join(this.getFolder(), "version.txt");
    }
    
    /**
     * Reads the installed version from the `version.txt` file.
     * Returns `null` if the file does not exist yet.
     */
    protected async readVersionFile(): Promise<string | null> {
        const versionFile = this.getVersionFile();
        if (!fs.existsSync(versionFile)) {
            log(this.name, `No version.txt at '${versionFile}', so the tool counts as not installed`);
            return null;
        }
        const content = await fs.promises.readFile(versionFile, "utf-8");
        return content.trim();
    }
    
    /**
     * Convenience wrapper around {@link readVersionFile} that swallows errors
     * and returns `null` instead of throwing.
     *
     * A version file without the executable next to it is a broken install, not an install:
     * reporting `null` makes `check()` wipe and re-download instead of trusting the tag forever.
     */
    protected async getCurrentVersion(): Promise<string | null> {
        let version: string | null;
        try {
            version = await this.readVersionFile();
        } catch (error) {
            log(this.name, `'${this.getVersionFile()}' could not be read, treating the tool as not installed: ${describeError(error)}`);
            return null;
        }

        if (version === null) return null;

        const executable = this.getExecutable();
        if (!fs.existsSync(executable)) {
            log(
                this.name,
                `version.txt claims '${version}' but '${executable}' is missing, so the tool will be reinstalled. `
                + `Folder holds: ${this.listFolder().join(", ") || "nothing"}`
            );
            return null;
        }
        return version;
    }

    /** Writes the given version tag to `version.txt`, creating the file if needed. */
    protected async writeVersionFile(version: string): Promise<void> {
        const versionFile = this.getVersionFile();
        PathUtils.ValidatePath(versionFile);
        try {
            await fs.promises.writeFile(versionFile, version, "utf-8");
        } catch (error) {
            log(this.name, `Could not write '${version}' to '${versionFile}': ${describeError(error)}`);
            throw error;
        }
        log(this.name, `Wrote '${version}' to '${versionFile}'`);
    }

    /**
     * Called after a successful install or update so subclasses can run
     * post-install steps (e.g. setting file permissions on Linux).
     * The default implementation is a no-op.
     */
    protected async onInstalled(_context: ToolInstalledContext) {}

    /**
     * Called just before the old installation folder is wiped during an update.
     * Override to clean up any resources that must be released first.
     * The default implementation is a no-op.
     */
    protected async onBeforeUpdate() {}

    /**
     * Fetches the latest GitHub release for {@link repository}.
     * Throws if the release cannot be retrieved.
     */
    protected async fetchLatestRelease(timeout?: number): Promise<GithubRelease> {
        const release = await GithubTools.getLatestRelease(this.repository, timeout);
        if (!release) {
            const msg = `Failed to fetch the latest release for ${this.name}.`;
            log(this.name, `${msg} GitHub answered but named no release for '${this.repository}'`);
            throw new Error(msg);
        }
        return release;
    }

    /**
     * Shows a {@link ToolUpdatePopup} and waits for the user to accept or
     * decline. Returns `true` if the user accepted the update.
     */
    protected async promptUpdate(currentVersion: string, latestVersion: string): Promise<boolean> {
        log(this.name, `Asking whether to update from '${currentVersion}' to '${latestVersion}'`);
        const accepted = await Popup.useAsync<boolean>(async ({ submit }) => {
            return <ToolUpdatePopup 
                name={this.name}
                currentVersion={currentVersion}
                latestVersion={latestVersion}
                accept={() => submit(true)}
                decline={() => submit(false)}
            />
        });
        log(this.name, `The update to '${latestVersion}' was ${accepted ? "accepted" : "declined"}`);
        return accepted;
    }

    /**
     * Downloads the release asset to `destination`, reporting progress via the
     * global {@link ProgressBar}.
     */
    protected async download(asset: GithubAsset, destination: string, latestTag: string): Promise<void> {
        log(this.name, `Downloading ${latestTag} asset '${asset.name}' from ${asset.downloadUrl} to '${destination}'`);
        await ProgressBar.useAsync(async ({ setStatus, setMessage, setProgress }) => {
            setStatus("downloading");
            await Downloader.downloadFile(asset.downloadUrl, destination, (downloaded, total) => {
                const percent = total > 0 ? downloaded / total : 0;
                setMessage(`Downloading ${this.name} ${latestTag}... (${(percent * 100).toFixed(2)}%)`);
                setProgress(percent);
            });
        });
    }

    /**
     * Extracts the downloaded archive to `destination`, reporting progress via
     * the global {@link ProgressBar}, then deletes the archive.
     * Throws if any entry could not be written.
     */
    protected async extract(archivePath: string, destination: string, latestTag: string): Promise<void> {
        try {
            await ProgressBar.useAsync(async ({ setStatus, setMessage, setProgress }) => {
                setStatus("extracting");
                await Extractor.extractFile(archivePath, destination, [], (fileIndex, totalFiles) => {
                    const percent = totalFiles > 0 ? fileIndex / totalFiles : 0;
                    setMessage(`Extracting ${this.name} ${latestTag}... (${(percent * 100).toFixed(2)}%)`);
                    setProgress(percent);
                });
            });
        } finally {
            // A corrupt archive must not be left behind for the next run to trip over.
            await fs.promises.rm(archivePath, { force: true }).catch(error => {
                log(this.name, `Could not remove the ${latestTag} archive '${archivePath}': ${describeError(error)}`);
            });
        }
    }

    /** Postcondition for a fresh install: the executable the caller was promised must exist. */
    private async assertInstallUsable(version: string): Promise<void> {
        const executable = this.getExecutable();
        if (fs.existsSync(executable)) return;

        log(
            this.name,
            `Extraction of '${version}' left no executable at '${executable}'. `
            + `'${this.getFolder()}' holds: ${this.listFolder().join(", ") || "nothing"}`
        );
        throw new Error(
            `${this.name} ${version} did not install correctly - "${this.getExecutableName()}" is missing. ` +
            `The download may be incomplete. Try again.`
        );
    }

    private listFolder(): string[] {
        try {
            return fs.readdirSync(this.getFolder());
        } catch (error) {
            return [`(unreadable: ${describeError(error)})`];
        }
    }

    /** Returns the platform-specific tools root directory from the app store. */
    protected getToolsPath(): string {
        return useAppStore.getState().platform.getPaths().toolsPath;
    }
}