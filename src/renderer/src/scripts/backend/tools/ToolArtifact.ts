import { log } from "@renderer/scripts/LauncherLog";
import { useAppStore } from "@renderer/states/AppStore";
import { describeError } from "@shared/diagnostics/Log";
import { GithubAsset } from "../github/GithubAsset";
import { GithubRelease } from "../github/GithubRelease";
import { GithubTools } from "../github/GithubTools";
import { ProgressBar } from "@renderer/states/ProgressBarStore";
import { Downloader } from "../Downloader";
import { Extractor } from "../Extractor";
import { PathUtils } from "@renderer/scripts/PathUtils";
import { askToolUpdate } from "@renderer/popups/ToolUpdatePopup";

const path = window.require("path") as typeof import("path");
const fs = window.require("fs") as typeof import("fs");

/** The replacement is built here and only swapped in once it is proven to work. */
const STAGING_SUFFIX = ".staging";

/** The previous installation, kept until the swap has succeeded. */
const BACKUP_SUFFIX = ".old";

/**
 * Fixed name for the downloaded archive. Deriving it from the asset name puts a file where the
 * extractor needs a folder whenever the asset carries no extension.
 */
const ARCHIVE_SUFFIX = ".download";

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
     * When `false` and the tool is already installed, skips the GitHub release fetch entirely
     * and returns the current version immediately. When `true`, performs the full version
     * check and update flow.
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
 */
export interface IToolArtifact {
    /** Human-readable name of the tool (e.g. `"XVDTool"`). */
    readonly name: string;
    /** GitHub repository slug in `"owner/repo"` format. */
    readonly repository: string;

    /**
     * Ensures the tool is installed (and optionally up-to-date), then returns
     * metadata about the installed version.
     */
    check(options?: Partial<DefaultCheckOptions>): Promise<ToolCheckResult>;
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

/** Drops absent fields so an explicit `undefined` cannot erase a subclass default. */
function stated(options: Partial<DefaultCheckOptions> | undefined): Partial<DefaultCheckOptions> {
    const result: Partial<DefaultCheckOptions> = {};
    if (options === undefined) return result;
    for (const [key, value] of Object.entries(options)) {
        if (value !== undefined) (result as Record<string, unknown>)[key] = value;
    }
    return result;
}

/**
 * Abstract base class for tools that are downloaded from GitHub Releases and
 * cached on disk. Subclasses only need to implement a handful of abstract
 * methods to describe platform-specific details (executable name, asset
 * selection, version comparison, and so on).
 */
export abstract class ToolArtifact implements IToolArtifact {
    readonly name: string;
    readonly repository: string;

    /** Serialises `check()` so two callers cannot install the same tool into the same folder at once. */
    private queue: Promise<unknown> = Promise.resolve();

    constructor(name: string, repository: string) {
        this.name = name;
        this.repository = repository;
    }

    /**
     * Main entry point. Checks whether the tool is installed and up-to-date,
     * downloading / updating it as needed. Calls are serialised per tool.
     */
    check(options?: Partial<DefaultCheckOptions>): Promise<ToolCheckResult> {
        const run = this.queue.then(() => this.runCheck(options), () => this.runCheck(options));
        this.queue = run.catch(() => {});
        return run;
    }

    /**
     * Flow:
     * 1. Guard - reject unsupported platforms early.
     * 2. Read currently installed version from disk.
     * 3. Fetch the latest GitHub release (subject to timeout).
     * 4. Compare versions; skip the download when already current.
     * 5. Optionally prompt the user before updating.
     * 6. Download and extract into a staging folder, verify it, swap it in.
     * 7. Write new version file and fire {@link onInstalled}.
     */
    private async runCheck(requested?: Partial<DefaultCheckOptions>): Promise<ToolCheckResult> {
        const options: DefaultCheckOptions = { ...this.checkDefaults(), ...stated(requested) };

        log(
            this.name,
            `check() for ${this.repository}: checkForUpdates=${options.checkForUpdates}, `
            + `promptForUpdate=${options.promptForUpdate}, allowOutdated=${options.allowOutdated}, `
            + `releaseFetchTimeout=${options.releaseFetchTimeout}ms`
        );

        // Reject unsupported platforms before doing any disk/network I/O.
        if (!this.isSupported()) {
            const msg = `${this.name} is not supported on this platform.`;
            log(this.name, `${msg} (platform ${window.process.platform}, arch ${window.process.arch})`);
            throw new Error(msg);
        }

        const toolPath = this.getFolder();
        PathUtils.ensureDirectory(toolPath);
        const executable = this.getExecutable();

        // Read the version that is currently installed (may be null if not yet installed).
        const currentVersion = await this.getCurrentVersion();
        const isInstalled = currentVersion !== null;
        log(
            this.name,
            `Installed version is ${currentVersion ?? "none"}; folder '${toolPath}', executable '${executable}'`
        );

        // If already installed and the caller does not need an update check, return immediately.
        if (isInstalled && !options.checkForUpdates) {
            log(this.name, `Already installed at '${currentVersion}' and no update check was asked for, skipping GitHub`);
            return this.buildResult(currentVersion, toolPath, executable, "up_to_date");
        }

        // Attempt to fetch the latest release from GitHub.
        let latestRelease: GithubRelease;
        try {
            latestRelease = await this.fetchLatestRelease(options.releaseFetchTimeout);
        } catch (error) {
            // If the tool is already installed and the caller allows an outdated
            // version, return the current installation rather than throwing.
            if (isInstalled && options.allowOutdated) {
                log(
                    this.name,
                    `GitHub could not be read, carrying on with the installed '${currentVersion}': ${describeError(error)}`
                );
                return this.buildResult(currentVersion, toolPath, executable, "up_to_date");
            }
            log(
                this.name,
                `GitHub could not be read and there is no usable installation to fall back on `
                + `(installed ${currentVersion ?? "none"}, allowOutdated ${options.allowOutdated}): `
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
            return this.buildResult(currentVersion, toolPath, executable, "up_to_date");
        }

        // An update is available. Ask the user if required.
        if (isInstalled) {
            const shouldUpdate = options.promptForUpdate
                ? await this.promptUpdate(currentVersion, latestTag)
                : true;

            if (!shouldUpdate) {
                if (options.allowOutdated) {
                    log(this.name, `Update to '${latestTag}' declined, carrying on with '${currentVersion}'`);
                    return this.buildResult(currentVersion, toolPath, executable, "update_skipped");
                }
                const msg = `${this.name} is outdated and update was declined.`;
                log(this.name, `Update to '${latestTag}' declined and '${currentVersion}' is not allowed to be used`);
                throw new Error(msg);
            }

            log(this.name, `Updating from '${currentVersion}' to '${latestTag}'`);
        } else {
            log(this.name, `Installing '${latestTag}' for the first time`);
        }

        try {
            await this.installStaged(asset, latestTag);
        } catch (error) {
            // The working installation is still in place, so an update that fails half way leaves
            // the user with the tool they had rather than with nothing.
            if (isInstalled && options.allowOutdated && fs.existsSync(executable)) {
                log(
                    this.name,
                    `Install of '${latestTag}' failed, carrying on with '${currentVersion}': ${describeError(error)}`
                );
                return this.buildResult(currentVersion, toolPath, executable, "up_to_date");
            }
            throw error;
        }

        const action: CheckAction = isInstalled ? "updated" : "installed";

        // Allow subclasses to run post-install logic (e.g. chmod on Linux).
        await this.onInstalled?.({ version: latestTag, action });

        // Persist the version so subsequent check() calls can skip redundant installs.
        await this.writeVersionFile(latestTag);
        log(this.name, `${this.name} ${action} at '${latestTag}' in '${toolPath}'`);

        return this.buildResult(latestTag, toolPath, executable, action);
    }

    /**
     * Downloads and extracts `asset` into a staging folder, checks the promised executable is
     * there, and only then puts it in place of the current installation. The working copy is
     * deleted last, and restored if the swap fails.
     */
    private async installStaged(asset: GithubAsset, latestTag: string): Promise<void> {
        const toolPath = this.getFolder();
        const stagingPath = toolPath + STAGING_SUFFIX;
        const archivePath = toolPath + ARCHIVE_SUFFIX;

        await fs.promises.rm(stagingPath, { recursive: true, force: true });

        try {
            await this.download(asset, archivePath, latestTag);
            await this.extract(archivePath, stagingPath, latestTag);
            await this.assertInstallUsable(stagingPath, latestTag);
            await this.swapIn(stagingPath, toolPath, latestTag);
        } catch (error) {
            // version.txt is deliberately not written and the staged folder is dropped, so the
            // next check() re-downloads instead of trusting a broken tool forever.
            log(this.name, `Install of '${latestTag}' failed, dropping '${stagingPath}': ${describeError(error)}`);
            await fs.promises.rm(stagingPath, { recursive: true, force: true }).catch(cleanupError => {
                log(this.name, `Could not remove '${stagingPath}': ${describeError(cleanupError)}`);
            });
            throw error;
        }
    }

    /** Moves the verified staging folder over the installation, keeping the old one until it lands. */
    private async swapIn(stagingPath: string, toolPath: string, latestTag: string): Promise<void> {
        const backupPath = toolPath + BACKUP_SUFFIX;
        await fs.promises.rm(backupPath, { recursive: true, force: true });

        const hadInstall = fs.existsSync(toolPath);
        if (hadInstall) await fs.promises.rename(toolPath, backupPath);

        try {
            await fs.promises.rename(stagingPath, toolPath);
        } catch (error) {
            if (hadInstall) {
                await fs.promises.rename(backupPath, toolPath).catch(restoreError => {
                    log(this.name, `Could not put '${backupPath}' back as '${toolPath}': ${describeError(restoreError)}`);
                });
            }
            throw error;
        }

        if (!hadInstall) return;
        await fs.promises.rm(backupPath, { recursive: true, force: true }).catch(error => {
            log(this.name, `'${latestTag}' is in place but '${backupPath}' could not be deleted: ${describeError(error)}`);
        });
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

    /** The options `check()` uses for anything the caller left unstated. */
    protected checkDefaults(): DefaultCheckOptions {
        return {
            promptForUpdate: false,
            allowOutdated: true,
            releaseFetchTimeout: 5000,
            checkForUpdates: false
        };
    }

    /** Constructs the value returned by `check()`. */
    protected buildResult(version: string, toolPath: string, executable: string, action: CheckAction): ToolCheckResult {
        return { version, path: toolPath, executable, action };
    }

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
    getVersionFile(): string {
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
     * reporting `null` makes `check()` re-download instead of trusting the tag forever.
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
                + `Folder holds: ${this.listFolder(this.getFolder()).join(", ") || "nothing"}`
            );
            return null;
        }
        return version;
    }

    /** Writes the given version tag to `version.txt`, creating the file if needed. */
    protected async writeVersionFile(version: string): Promise<void> {
        const versionFile = this.getVersionFile();
        PathUtils.ensureParentDirectory(versionFile);
        try {
            await fs.promises.writeFile(versionFile, version, "utf-8");
        } catch (error) {
            log(this.name, `Could not write '${version}' to '${versionFile}': ${describeError(error)}`);
            throw error;
        }
        log(this.name, `Wrote '${version}' to '${versionFile}'`);
    }

    /**
     * Implemented by subclasses that need post-install steps (e.g. setting file
     * permissions on Linux) after a successful install or update.
     */
    protected onInstalled?(context: ToolInstalledContext): Promise<void>;

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
     * Asks the user whether to take the update. Returns `true` if they accepted.
     */
    protected async promptUpdate(currentVersion: string, latestVersion: string): Promise<boolean> {
        log(this.name, `Asking whether to update from '${currentVersion}' to '${latestVersion}'`);
        const accepted = await askToolUpdate({ name: this.name, currentVersion, latestVersion });
        log(this.name, `The update to '${latestVersion}' was ${accepted ? "accepted" : "declined"}`);
        return accepted;
    }

    /**
     * Downloads the release asset to `destination`, reporting progress via the
     * global {@link ProgressBar}. The size GitHub records for the asset is passed through, so a
     * response that declares no length is still checked for truncation.
     */
    protected async download(asset: GithubAsset, destination: string, latestTag: string): Promise<void> {
        log(this.name, `Downloading ${latestTag} asset '${asset.name}' from ${asset.downloadUrl} to '${destination}'`);
        await ProgressBar.runAsync(async ({ setStatus, setMessage, setProgress }) => {
            setStatus("downloading");
            await Downloader.downloadFile(
                asset.downloadUrl,
                destination,
                (downloaded, total) => {
                    const percent = total > 0 ? downloaded / total : 0;
                    setMessage(`Downloading ${this.name} ${latestTag}... (${(percent * 100).toFixed(2)}%)`);
                    setProgress(percent);
                },
                undefined,
                { expectedBytes: asset.size }
            );
        });
    }

    /**
     * Extracts the downloaded archive to `destination`, reporting progress via
     * the global {@link ProgressBar}, then deletes the archive.
     * Throws if any entry could not be written.
     */
    protected async extract(archivePath: string, destination: string, latestTag: string): Promise<void> {
        try {
            await ProgressBar.runAsync(async ({ setStatus, setMessage, setProgress }) => {
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

    /** Postcondition for a staged install: the executable the caller was promised must be there. */
    private async assertInstallUsable(folder: string, version: string): Promise<void> {
        if (fs.existsSync(path.join(folder, this.getExecutableName()))) return;

        log(
            this.name,
            `Extraction of '${version}' left no executable in '${folder}'. `
            + `It holds: ${this.listFolder(folder).join(", ") || "nothing"}`
        );
        throw new Error(
            `${this.name} ${version} did not install correctly - "${this.getExecutableName()}" is missing. ` +
            `The download may be incomplete. Try again.`
        );
    }

    private listFolder(folder: string): string[] {
        try {
            return fs.readdirSync(folder);
        } catch (error) {
            return [`(unreadable: ${describeError(error)})`];
        }
    }

    /** Returns the platform-specific tools root directory from the app store. */
    protected getToolsPath(): string {
        return useAppStore.getState().platform.getPaths().toolsPath;
    }
}

/** Names an archive rather than a checksum, signature or release note shipped beside it. */
const ARCHIVE_EXTENSIONS = [".zip", ".tar.gz", ".tgz", ".tar.xz", ".tar.zst", ".7z"];

/**
 * Configuration for {@link ArchiveToolArtifact}, which covers every tool whose release is a
 * single archive holding one executable.
 */
export interface ArchiveToolOptions {
    name: string;
    /** GitHub repository slug in `"owner/repo"` format. */
    repository: string;
    executableName: string;
    /** Platforms the tool ships builds for. */
    platforms: string[];
    /** Narrows the release assets to the ones built for this platform. */
    assetPattern?: RegExp;
    /** Applied recursively after install, because release archives do not carry the executable bit. */
    permissions?: number;
    /** Overrides for the options `check()` uses when the caller states nothing. */
    checkDefaults?: Partial<DefaultCheckOptions>;
}

/**
 * A tool whose release ships one archive, compared by exact tag equality. Everything that
 * differs between such tools is data rather than code.
 */
export class ArchiveToolArtifact extends ToolArtifact {
    private readonly options: ArchiveToolOptions;

    constructor(options: ArchiveToolOptions) {
        super(options.name, options.repository);
        this.options = options;
    }

    isSupported(): boolean {
        const supported = this.options.platforms.includes(window.process.platform);
        if (!supported) {
            log(
                this.name,
                `Not supported on platform '${window.process.platform}', `
                + `${this.options.platforms.join(" and ")} only`
            );
        }
        return supported;
    }

    protected checkDefaults(): DefaultCheckOptions {
        return { ...super.checkDefaults(), ...this.options.checkDefaults };
    }

    protected getFolderName(): string {
        return this.name;
    }

    protected getExecutableName(): string {
        return this.options.executableName;
    }

    /**
     * Picks the archive built for this platform. Taking whatever asset happens to be first
     * hands the extractor a checksum file whenever a release ships one.
     */
    protected async findAsset(release: GithubRelease): Promise<GithubAsset | null> {
        const pattern = this.options.assetPattern;
        const matching = pattern ? release.assets.filter(a => pattern.test(a.name)) : release.assets;
        const archives = matching.filter(a => ARCHIVE_EXTENSIONS.some(ext => a.name.toLowerCase().endsWith(ext)));

        if (archives.length === 0) {
            log(
                this.name,
                `Release ${release.tagName} ships no archive this tool can use; it offers `
                + `${release.assets.map(a => a.name).join(", ") || "no assets"}`
            );
            return null;
        }

        // The extractor reads zip archives, so a release offering both formats must yield the zip.
        const asset = archives.find(a => a.name.toLowerCase().endsWith(".zip")) ?? archives[0];
        log(this.name, `Release ${release.tagName} asset '${asset.name}' chosen from ${release.assets.length} assets`);
        return asset;
    }

    protected compareTags(current: string | null, latest: string): number {
        if (!current) return -1;
        return current === latest ? 0 : -1;
    }

    protected async onInstalled(context: ToolInstalledContext): Promise<void> {
        const mode = this.options.permissions;
        if (mode === undefined) return;

        const folder = this.getFolder();
        log(this.name, `${context.action} '${context.version}', marking everything in '${folder}' executable`);
        try {
            await PathUtils.chmodRecursive(folder, mode);
        } catch (error) {
            log(this.name, `chmod ${mode.toString(8)} across '${folder}' failed: ${describeError(error)}`);
            throw error;
        }
    }
}
