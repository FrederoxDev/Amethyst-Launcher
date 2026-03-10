import { useAppStore } from "@renderer/states/AppStore";
import { ProgressBar } from "@renderer/states/ProgressBarStore";
import { GithubRelease } from "../github/GithubRelease";
import { CheckAction, DefaultCheckOptions, ToolArtifact, ToolCheckResult, ToolInstalledContext } from "./ToolArtifact";
import { GithubAsset } from "../github/GithubAsset";

const fs = window.require("fs") as typeof import("fs");
const semver = window.require("semver") as typeof import("semver");

/**
 * Shape of the JSON lines that XVDTool prints to stdout/stderr while it runs.
 * All fields are nullable – a single line may carry only a subset of them.
 */
interface OutputModel { 
    /** Human-readable status message to display in the UI. */
    message: string | null;
    /** Error message printed by the tool (non-fatal unless the process exits with a non-zero code). */
    error: string | null;
    /** Progress value in the [0, 1] range, when the tool reports it directly. */
    progress: number | null;
    /** Denominator for fractional progress (used together with `current`). */
    total: number | null;
    /** Numerator for fractional progress (used together with `total`). */
    current: number | null;
};

/**
 * Concrete {@link ToolArtifact} implementation for
 * [XVDTool](https://github.com/AmethystAPI/xvdtool) – a utility for working
 * with Xbox Virtual Disk (XVD) files.
 *
 * Supported platforms: **Windows x64** and **Linux x64**.
 *
 * Typical usage:
 * ```ts
 * const xvd = new XVDTool();
 * await xvd.decryptFile(inputPath, cikUuid, cikData);
 * await xvd.extractFile(inputPath, outputFolder);
 * ```
 */
export class XVDTool extends ToolArtifact {
    readonly name: string = "xvdtool";
    /** GitHub repository that hosts XVDTool releases. */
    readonly repository: string = "AmethystAPI/xvdtool";

    /**
     * XVDTool only ships binaries for Windows x64 and Linux x64.
     */
    isSupported(): boolean {
        const supported = (window.process.platform === "win32" || window.process.platform === "linux") && window.process.arch === "x64";
        console.log(`[${this.name}] isSupported() → ${supported} (platform='${window.process.platform}', arch='${window.process.arch}').`);
        return supported;
    }

    /**
     * Overrides the base `check()` to supply XVDTool-specific defaults:
     * - `promptForUpdate`: `true` – always ask before updating.
     * - `allowOutdated`: `true` – tolerate an older version when GitHub is unreachable.
     * - `releaseFetchTimeout`: `1500` ms.
     */
    check(options?: DefaultCheckOptions | undefined): Promise<ToolCheckResult> {
        const resolvedOptions = { 
            promptForUpdate: options?.promptForUpdate ?? true,
            allowOutdated: options?.allowOutdated ?? true,
            releaseFetchTimeout: options?.releaseFetchTimeout ?? 1500,
            checkForUpdates: options?.checkForUpdates ?? true
        };
        return super.check(resolvedOptions);
    }

    /** The installation folder is simply named after the tool. */
    protected getFolderName(): string {
        return this.name;
    }

    /**
     * Returns the executable filename for the current platform.
     * On Windows the `.exe` suffix is appended; on Linux the binary has no extension.
     */
    protected getExecutableName(): string {
        const exeName = "XVDTool" + (window.process.platform === "win32" ? ".exe" : "");
        console.log(`[${this.name}] getExecutableName() → '${exeName}'.`);
        return exeName;
    }

    /**
     * Searches the release assets for one whose filename contains both the
     * current platform identifier (e.g. `'linux'`) and the architecture
     * identifier (e.g. `'x64'`). Returns the first match, or `null` if none
     * are found.
     */
    protected async findAsset(release: GithubRelease): Promise<GithubAsset | null> {
        const platform = window.process.platform;
        const arch = window.process.arch;
        for (const asset of release.assets) {
            const name = asset.name.toLowerCase();
            if (name.includes(platform) && name.includes(arch)) {
                return asset;
            }
        }

        return null;
    }

    /**
     * Compares two version tags using semver when possible, falling back to a
     * simple lexicographic comparison for non-semver tags.
     *
     * @returns Negative if `current` is older, 0 if equal, positive if newer.
     */
    protected compareTags(current: string | null, latest: string): number {
        // Treat missing version as infinitely old.
        if (!current) {
            return -1;
        }
        try {
            const result = semver.compare(current, latest);
            return result;
        } catch {
            // If tags are not valid semver, fallback to string comparison.
            const result = current.localeCompare(latest);
            return result;
        }
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
     * Post-install hook: on Linux, marks the XVDTool executable as executable
     * (`chmod 755`) since GitHub release tarballs do not preserve permissions.
     */
    protected onInstalled(context: ToolInstalledContext): Promise<void> {
        console.log(`[${this.name}] onInstalled: version='${context.version}', action='${context.action}'.`);
        if (process.platform === "linux") {
            const exe = this.getExecutable();
            console.log(`[${this.name}] Applying chmod 755 to '${exe}' (Linux requires explicit execute permission).`);
            return fs.promises.chmod(exe, 0o755);
        }
        return Promise.resolve();
    }

    /**
     * Decrypts an XVD file using its Content Integrity Key (CIK).
     *
     * The underlying command is:
     * ```
     * XVDTool -nd -eu -cik <uuid> -cikdata <data> <inputFile>
     * ```
     * Progress is reported through the global {@link ProgressBar}.
     *
     * @param inputFile      Absolute path to the `.xvd` file to decrypt.
     * @param cikUuid        UUID of the CIK to use for decryption.
     * @param cikData        Hex-encoded raw CIK data.
     * @param shouldAskUpdate When `true`, prompts the user before updating XVDTool.
     * @returns Always resolves to `null` (output is reported via progress events).
     */
    async decryptFile(inputFile: string, cikUuid: string, cikData: string, checkForUpdates: boolean = false): Promise<string | null> {
        console.log(`[${this.name}] decryptFile() called. inputFile='${inputFile}', cikUuid='${cikUuid}', checkForUpdates=${checkForUpdates}.`);
        const platform = useAppStore.getState().platform;

        // Ensure XVDTool is installed (and optionally up-to-date) before running.
        const { executable: xvdtoolExecutable } = await this.check({ 
            allowOutdated: true,
            promptForUpdate: true,
            releaseFetchTimeout: 1500,
            checkForUpdates
        });

        const command = `"${xvdtoolExecutable}" -nd -eu -cik "${cikUuid}" -cikdata "${cikData}" "${inputFile}"`;
        console.log(`[${this.name}] Running decrypt command: ${command}`);

        return new Promise<string | null>(async (resolve, reject) => {
            await ProgressBar.useAsync(async ({ setStatus, setMessage, setProgress }) => {
                setStatus("decrypting");
                await platform.runCommand(command, (data) => {
                    // XVDTool emits one JSON object per line; non-JSON lines are silently skipped.
                    for (const line of data.split("\n")) {
                        try {
                            const dataJson: OutputModel = {
                                message: null,
                                error: null,
                                progress: null,
                                total: null,
                                current: null,
                                ...JSON.parse(line)
                            } as OutputModel;

                            if (dataJson.error) {
                                // Log tool-reported errors but don't reject – the process may still succeed.
                                console.error(`[${this.name}] Tool error: ${dataJson.error}`);
                            }
                            
                            if (dataJson.message) {
                                setMessage(dataJson.message);
                            } 
                            
                            // Prefer an explicit [0,1] progress value; otherwise derive it from current/total.
                            if (dataJson.progress !== null) {
                                setProgress(dataJson.progress);
                            } else if (dataJson.current !== null && dataJson.total !== null) {
                                setProgress((dataJson.current ?? 0) / (dataJson.total ?? 1));
                            }
                        }
                        catch {
                            // Skip lines that are not valid JSON (e.g. blank lines or plain-text output).
                        }
                    }
                }).catch(err => {
                    console.error(`[${this.name}] decryptFile: process exited with error:`, err);
                    reject(err);
                });
                console.log(`[${this.name}] decryptFile: operation finished for '${inputFile}'.`);
                resolve(null);
            });
        });
    }

    /**
     * Extracts the contents of an XVD file to a folder.
     *
     * The underlying command is:
     * ```
     * XVDTool -nd -xf <outputFolder> <inputFile>
     * ```
     * Progress is reported through the global {@link ProgressBar}.
     *
     * @param inputFile      Absolute path to the `.xvd` file to extract.
     * @param outputFolder   Destination folder for the extracted contents.
     * @param shouldAskUpdate When `true`, prompts the user before updating XVDTool.
     * @returns Always resolves to `null` (output is reported via progress events).
     */
    async extractFile(inputFile: string, outputFolder: string, checkForUpdates: boolean = false): Promise<string | null> {
        console.log(`[${this.name}] extractFile() called. inputFile='${inputFile}', outputFolder='${outputFolder}', checkForUpdates=${checkForUpdates}.`);
        const platform = useAppStore.getState().platform;

        // Ensure XVDTool is installed (and optionally up-to-date) before running.
        const { executable: xvdtoolExecutable } = await this.check({ 
            allowOutdated: true,
            promptForUpdate: true,
            releaseFetchTimeout: 1500,
            checkForUpdates
        });

        const command = `"${xvdtoolExecutable}" -nd -xf "${outputFolder}" "${inputFile}"`;
        console.log(`[${this.name}] Running extract command: ${command}`);

        return new Promise<string | null>(async (resolve, reject) => {
            await ProgressBar.useAsync(async ({ setStatus, setMessage, setProgress }) => {
                setStatus("extracting");
                await platform.runCommand(command, (data) => {
                    // XVDTool emits one JSON object per line; non-JSON lines are silently skipped.
                    for (const line of data.split("\n")) {
                        try {
                            const dataJson: OutputModel = {
                                message: null,
                                error: null,
                                progress: null,
                                total: null,
                                current: null,
                                ...JSON.parse(line)
                            } as OutputModel;

                            if (dataJson.error) {
                                // Log tool-reported errors but don't reject – the process may still succeed.
                                console.error(`[${this.name}] Tool error: ${dataJson.error}`);
                            }
                            
                            if (dataJson.message) {
                                setMessage(dataJson.message);
                            } 
                            
                            // Prefer an explicit [0,1] progress value; otherwise derive it from current/total.
                            if (dataJson.progress !== null) {
                                setProgress(dataJson.progress);
                            } else if (dataJson.current !== null && dataJson.total !== null) {
                                setProgress((dataJson.current ?? 0) / (dataJson.total ?? 1));
                            }
                        }
                        catch {
                            // Skip lines that are not valid JSON (e.g. blank lines or plain-text output).
                        }
                    }
                }).catch(err => {
                    console.error(`[${this.name}] extractFile: process exited with error:`, err);
                    reject(err);
                });
                console.log(`[${this.name}] extractFile: operation finished for '${inputFile}'.`);
                resolve(null);
            });
        });
    }
}