import { AppStatusType } from "@renderer/scripts/AppStatus";
import { ProgressBar } from "@renderer/states/ProgressBarStore";
import { describeResult, run } from "@shared/diagnostics/ProcessRunner";
import { GithubRelease } from "../github/GithubRelease";
import { CheckAction, DefaultCheckOptions, ToolArtifact, ToolCheckResult, ToolInstalledContext } from "./ToolArtifact";
import { GithubAsset } from "../github/GithubAsset";
import { DotnetRequirement, DotnetRuntime } from "../DotnetRuntime";

const fs = window.require("fs") as typeof import("fs");
const semver = window.require("semver") as typeof import("semver");

/** XVDTool.runtimeconfig.json pins `Microsoft.NETCore.App 8.0.0`, and roll-forward never crosses a major. */
const XVDTOOL_RUNTIME: DotnetRequirement = { major: 8, channel: "8.0", toolName: "XVDTool" };

/** Generous, because a full msixvc runs for many minutes, but never unbounded. */
const XVDTOOL_TIMEOUT_MS = 60 * 60_000;

/**
 * Shape of the JSON lines that XVDTool prints to stdout/stderr while it runs.
 * All fields are nullable, and a single line may carry only a subset of them.
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
     *
     * Also makes sure the .NET runtime XVDTool needs is present, since XVDTool
     * is a framework-dependent .NET application and cannot start without it.
     */
    async check(options?: DefaultCheckOptions | undefined): Promise<ToolCheckResult> {
        const resolvedOptions = {
            promptForUpdate: options?.promptForUpdate ?? true,
            allowOutdated: options?.allowOutdated ?? true,
            releaseFetchTimeout: options?.releaseFetchTimeout ?? 1500,
            checkForUpdates: options?.checkForUpdates ?? true
        };
        const result = await super.check(resolvedOptions);
        await DotnetRuntime.ensure(XVDTOOL_RUNTIME);
        return result;
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
     * @param cikKeys        Record of CIK UUID to hex-encoded CIK data. All keys will be tried until one succeeds.
     * @param shouldAskUpdate When `true`, prompts the user before updating XVDTool.
     * @returns Always resolves to `null` (output is reported via progress events).
     */
    async decryptFile(inputFile: string, cikKeys: Record<string, string>, checkForUpdates: boolean = false): Promise<string | null> {
        console.log(`[${this.name}] decryptFile() called. inputFile='${inputFile}', keys=${Object.keys(cikKeys).length}, checkForUpdates=${checkForUpdates}.`);

        // Ensure XVDTool is installed (and optionally up-to-date) before running.
        const { executable: xvdtoolExecutable } = await this.check({
            allowOutdated: true,
            promptForUpdate: true,
            releaseFetchTimeout: 1500,
            checkForUpdates
        });

        const entries = Object.entries(cikKeys);
        if (entries.length === 0) throw new Error("Decryption failed: no CIK keys were provided.");

        let lastError = "";
        for (const [cikUuid, cikData] of entries) {
            console.log(`[${this.name}] Trying CIK ${cikUuid}...`);
            try {
                await this.runTool("decrypting", xvdtoolExecutable, [
                    "-nd", "-eu", "-cik", cikUuid, "-cikdata", cikData, inputFile
                ]);
                console.log(`[${this.name}] Decrypted '${inputFile}' with CIK ${cikUuid}.`);
                return null;
            } catch (err) {
                lastError = err instanceof Error ? err.message : String(err);
                console.warn(`[${this.name}] CIK ${cikUuid} failed: ${lastError}`);
            }
        }
        throw new Error(`Decryption failed: none of the ${entries.length} known CIK keys worked. Last error: ${lastError}`);
    }

    /**
     * Runs XVDTool once and reports what it did. Every exit is an outcome: a tool that cannot
     * start, one that reports an error line, one that ends non-zero and one that stops
     * responding all arrive here as a thrown error rather than a promise nobody settles.
     */
    private async runTool(status: AppStatusType, executable: string, args: string[]): Promise<void> {
        console.log(`[${this.name}] Running: ${executable} ${args.join(" ")}`);

        await ProgressBar.useAsync(async ({ setStatus, setMessage, setProgress }) => {
            setStatus(status);
            const toolErrors: string[] = [];

            const result = await run(executable, args, {
                timeoutMs: XVDTOOL_TIMEOUT_MS,
                // Both streams: the JSON protocol is documented as arriving on either.
                onLine: line => {
                    const error = this.consumeLine(line, setMessage, setProgress);
                    if (error) toolErrors.push(error);
                },
            });

            if (result.spawnError || result.timedOut || result.code !== 0 || toolErrors.length > 0) {
                console.error(`[${this.name}] Run failed.\n${describeResult(result)}`);
            }

            if (result.spawnError) throw new Error(`XVDTool could not be started (${result.spawnError}).`);
            if (result.timedOut) {
                throw new Error(`XVDTool stopped responding and was closed after ${XVDTOOL_TIMEOUT_MS / 60_000} minutes.`);
            }
            if (toolErrors.length > 0) throw new Error(toolErrors.join("; "));
            if (result.code !== 0) throw new Error(`XVDTool ended with code ${result.code}. ${result.output}`.trim());
        });
    }

    /** Returns the error the line reported, if it reported one. XVDTool prints one JSON object per line. */
    private consumeLine(
        line: string,
        setMessage: (message: string) => void,
        setProgress: (progress: number) => void
    ): string | null {
        let parsed: OutputModel;
        try {
            parsed = {
                message: null,
                error: null,
                progress: null,
                total: null,
                current: null,
                ...JSON.parse(line)
            } as OutputModel;
        } catch {
            console.warn(`[${this.name}] Non-JSON output: ${line}`);
            return null;
        }

        if (parsed.message) setMessage(parsed.message);

        // Prefer an explicit [0,1] progress value; otherwise derive it from current/total.
        if (parsed.progress !== null) {
            setProgress(parsed.progress);
        } else if (parsed.current !== null && parsed.total !== null) {
            setProgress((parsed.current ?? 0) / (parsed.total ?? 1));
        }

        if (!parsed.error) return null;
        const detail = parsed.message ? `${parsed.error}: ${parsed.message}` : `${parsed.error} (raw: ${line})`;
        console.error(`[${this.name}] Tool error: ${detail}`);
        return detail;
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

        // Ensure XVDTool is installed (and optionally up-to-date) before running.
        const { executable: xvdtoolExecutable } = await this.check({
            allowOutdated: true,
            promptForUpdate: true,
            releaseFetchTimeout: 1500,
            checkForUpdates
        });

        await this.runTool("extracting", xvdtoolExecutable, ["-nd", "-xf", outputFolder, inputFile]);

        const written = fs.existsSync(outputFolder) ? fs.readdirSync(outputFolder).length : 0;
        if (written === 0) {
            console.error(`[${this.name}] Extraction left ${outputFolder} empty.`);
            throw new Error(`XVDTool reported success but nothing was written to ${outputFolder}.`);
        }
        console.log(`[${this.name}] Extracted '${inputFile}' to '${outputFolder}'.`);
        return null;
    }
}