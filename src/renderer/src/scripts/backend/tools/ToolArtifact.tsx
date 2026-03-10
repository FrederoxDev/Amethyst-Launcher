import { useAppStore } from "@renderer/states/AppStore";
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
 * - `"installed"` – the tool was freshly installed (was not present before).
 * - `"updated"` – the tool was already installed and has just been updated.
 * - `"update_skipped"` – an update was available but the user declined it.
 * - `"up_to_date"` – the installed version is already the latest.
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
 * selection, version comparison, …).
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
     * 1. Guard – reject unsupported platforms early.
     * 2. Read currently installed version from disk.
     * 3. Fetch the latest GitHub release (subject to timeout).
     * 4. Compare versions; skip the download when already current.
     * 5. Optionally prompt the user before updating.
     * 6. Remove old installation, download archive, extract.
     * 7. Write new version file and fire {@link onInstalled}.
     */
    async check(options?: TCheckOptions): Promise<TCheckResult> {
        console.log(`[${this.name}] check() called with options:`, options);

        // Reject unsupported platforms before doing any disk/network I/O.
        if (!this.isSupported()) {
            const msg = `${this.name} is not supported on this platform.`;
            console.error(`[${this.name}] ${msg}`);
            throw new Error(msg);
        }

        const toolPath = this.getFolder();
        PathUtils.ValidatePath(toolPath);
        const executable = this.getExecutable();
        console.log(`[${this.name}] Tool folder: '${toolPath}' | Executable: '${executable}'`);

        // Read the version that is currently installed (may be null if not yet installed).
        const currentVersion = await this.getCurrentVersion();
        const isInstalled = currentVersion !== null;
        console.log(`[${this.name}] Currently installed version: ${currentVersion ?? "(none)"}`);

        // If already installed and the caller does not need an update check, return immediately.
        if (isInstalled && !options?.checkForUpdates) {
            console.log(`[${this.name}] checkForUpdates=false and tool is installed – skipping remote check.`);
            return this.buildResult(currentVersion!, toolPath, executable, "up_to_date");
        }

        // Attempt to fetch the latest release from GitHub.
        let latestRelease: GithubRelease | null = null;
        try {
            console.log(`[${this.name}] Fetching latest release from GitHub (timeout: ${options?.releaseFetchTimeout}ms)…`);
            latestRelease = await this.fetchLatestRelease(options?.releaseFetchTimeout);
            console.log(`[${this.name}] Latest release tag: '${latestRelease.tagName}'.`);
        } catch (error) {
            console.warn(`[${this.name}] Failed to fetch latest release:`, error);
            // If the tool is already installed and the caller allows an outdated
            // version, return the current installation rather than throwing.
            if (isInstalled && options?.allowOutdated) {
                console.log(`[${this.name}] Falling back to installed version '${currentVersion}' (allowOutdated=true).`);
                return this.buildResult(currentVersion!, toolPath, executable, "up_to_date");
            }
            throw error;
        }

        // Locate the release asset that matches the current platform/arch.
        const asset = await this.findAsset(latestRelease);
        if (!asset) {
            const msg = `No suitable asset found for the latest release of ${this.name}.`;
            console.error(`[${this.name}] ${msg}`);
            throw new Error(msg);
        }
        console.log(`[${this.name}] Matched release asset: '${asset.name}'.`);

        const latestTag = latestRelease.tagName;
        const compareResult = this.compareTags(currentVersion, latestTag);
        console.log(`[${this.name}] Version comparison result: ${compareResult} (current='${currentVersion}', latest='${latestTag}').`);

        // Already on the latest (or newer) version – nothing to do.
        if (compareResult >= 0 && isInstalled) {
            console.log(`[${this.name}] Already up-to-date at version '${currentVersion}'.`);
            return this.buildResult(currentVersion!, toolPath, executable, "up_to_date");
        }

        // An update is available. Ask the user if required.
        if (isInstalled) {
            console.log(`[${this.name}] Update available: '${currentVersion}' → '${latestTag}'.`);
            const shouldUpdate = options?.promptForUpdate
                ? await this.promptUpdate(currentVersion!, latestTag)
                : true;

            if (!shouldUpdate) {
                console.log(`[${this.name}] User declined the update.`);
                if (options?.allowOutdated) {
                    return this.buildResult(currentVersion!, toolPath, executable, "update_skipped");
                }
                const msg = `${this.name} is outdated and update was declined.`;
                console.error(`[${this.name}] ${msg}`);
                throw new Error(msg);
            }

            console.log(`[${this.name}] Proceeding with update. Running onBeforeUpdate hook…`);
            await this.onBeforeUpdate();
        }

        // Wipe the existing installation folder so the extract is clean.
        console.log(`[${this.name}] Removing old installation at '${toolPath}'…`);
        await fs.promises.rm(toolPath, { recursive: true, force: true });

        // Download the release archive next to the tool folder.
        const archivePath = toolPath + path.extname(asset.name);
        console.log(`[${this.name}] Downloading archive to '${archivePath}'…`);
        await this.download(asset, archivePath, latestTag);

        // Extract the archive into the tool folder.
        console.log(`[${this.name}] Extracting archive to '${toolPath}'…`);
        await this.extract(archivePath, toolPath, latestTag);

        const action: CheckAction = isInstalled ? "updated" : "installed";
        console.log(`[${this.name}] Tool ${action} successfully at version '${latestTag}'.`);

        // Allow subclasses to run post-install logic (e.g. chmod on Linux).
        await this.onInstalled({ version: latestTag, action });

        // Persist the version so subsequent check() calls can skip redundant installs.
        await this.writeVersionFile(latestTag);
        console.log(`[${this.name}] Version file written with tag '${latestTag}'.`);

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
            console.log(`[${this.name}] version.txt not found at '${versionFile}'; treating as uninstalled.`);
            return null;
        }
        const content = await fs.promises.readFile(versionFile, "utf-8");
        return content.trim();
    }
    
    /**
     * Convenience wrapper around {@link readVersionFile} that swallows errors
     * and returns `null` instead of throwing.
     */
    protected async getCurrentVersion(): Promise<string | null> {
        try {
            return await this.readVersionFile();
        } catch (error) {
            console.warn(`[${this.name}] Failed to read version file:`, error);
            return null;
        }
    }

    /** Writes the given version tag to `version.txt`, creating the file if needed. */
    protected async writeVersionFile(version: string): Promise<void> {
        const versionFile = this.getVersionFile();
        PathUtils.ValidatePath(versionFile);
        console.log(`[${this.name}] Writing version '${version}' to '${versionFile}'.`);
        await fs.promises.writeFile(versionFile, version, "utf-8");
    }

    /**
     * Called after a successful install or update so subclasses can run
     * post-install steps (e.g. setting file permissions on Linux).
     * The default implementation is a no-op.
     */
    protected async onInstalled(context: ToolInstalledContext) {}

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
        console.log(`[${this.name}] Fetching latest release for repository '${this.repository}'…`);
        const release = await GithubTools.getLatestRelease(this.repository, timeout);
        if (!release) {
            const msg = `Failed to fetch the latest release for ${this.name}.`;
            console.error(`[${this.name}] ${msg}`);
            throw new Error(msg);
        }
        console.log(`[${this.name}] Fetched release '${release.tagName}'.`);
        return release;
    }

    /**
     * Shows a {@link ToolUpdatePopup} and waits for the user to accept or
     * decline. Returns `true` if the user accepted the update.
     */
    protected async promptUpdate(currentVersion: string, latestVersion: string): Promise<boolean> {
        console.log(`[${this.name}] Prompting user for update: '${currentVersion}' → '${latestVersion}'.`);
        const accepted = await Popup.useAsync<boolean>(async ({ submit }) => {
            return <ToolUpdatePopup 
                name={this.name}
                currentVersion={currentVersion}
                latestVersion={latestVersion}
                accept={() => submit(true)}
                decline={() => submit(false)}
            />
        });
        console.log(`[${this.name}] User ${accepted ? "accepted" : "declined"} the update.`);
        return accepted;
    }

    /**
     * Downloads the release asset to `destination`, reporting progress via the
     * global {@link ProgressBar}.
     */
    protected async download(asset: GithubAsset, destination: string, latestTag: string): Promise<void> {
        console.log(`[${this.name}] Starting download: '${asset.downloadUrl}' → '${destination}'.`);
        await ProgressBar.useAsync(async ({ setStatus, setMessage, setProgress }) => {
            setStatus("downloading");
            await Downloader.downloadFile(asset.downloadUrl, destination, (downloaded, total) => {
                const percent = total > 0 ? downloaded / total : 0;
                setMessage(`Downloading ${this.name} ${latestTag}... (${(percent * 100).toFixed(2)}%)`);
                setProgress(percent);
            });
        });
        console.log(`[${this.name}] Download complete: '${destination}'.`);
    }

    /**
     * Extracts the downloaded archive to `destination`, reporting progress via
     * the global {@link ProgressBar}, then deletes the archive.
     */
    protected async extract(archivePath: string, destination: string, latestTag: string): Promise<void> {
        console.log(`[${this.name}] Starting extraction: '${archivePath}' → '${destination}'.`);
        await ProgressBar.useAsync(async ({ setStatus, setMessage, setProgress }) => {
            setStatus("extracting");
            await Extractor.extractFile(archivePath, destination, [], (fileIndex, totalFiles) => {
                const percent = totalFiles > 0 ? fileIndex / totalFiles : 0;
                setMessage(`Extracting ${this.name} ${latestTag}... (${(percent * 100).toFixed(2)}%)`);
                setProgress(percent);
            });
        });
        // Clean up the archive now that extraction is done.
        console.log(`[${this.name}] Extraction complete. Removing archive '${archivePath}'.`);
        await fs.promises.rm(archivePath, { force: true });
    }

    /** Returns the platform-specific tools root directory from the app store. */
    protected getToolsPath(): string {
        return useAppStore.getState().platform.getPaths().toolsPath;
    }
}