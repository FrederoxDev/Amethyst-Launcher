import { AppStatusType } from "@renderer/scripts/AppStatus";
import { log } from "@renderer/scripts/LauncherLog";
import { ProgressBar } from "@renderer/states/ProgressBarStore";
import { describeError } from "@shared/diagnostics/Log";
import { describeResult, run } from "@shared/diagnostics/ProcessRunner";
import { GithubRelease } from "../github/GithubRelease";
import { DefaultCheckOptions, ToolArtifact, ToolInstalledContext } from "./ToolArtifact";
import { GithubAsset } from "../github/GithubAsset";

const fs = window.require("fs") as typeof import("fs");
const semver = window.require("semver") as typeof import("semver");

/** Generous, because a full msixvc runs for many minutes, but never unbounded. */
const XVDTOOL_TIMEOUT_MS = 60 * 60_000;

/**
 * The CIK guid identifies which key was tried and is worth logging; the key bytes that follow
 * `-cikdata` are the secret itself and must never reach a log file a tester sends on.
 */
function redactCik(args: string[]): string[] {
    return args.map((arg, index) => (args[index - 1] === "-cikdata" ? `<${arg.length} chars redacted>` : arg));
}

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
}

/**
 * Concrete {@link ToolArtifact} implementation for
 * [XVDTool](https://github.com/AmethystAPI/xvdtool) - a utility for working
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
    constructor() {
        super("xvdtool", "AmethystAPI/xvdtool");
    }

    /**
     * XVDTool only ships binaries for Windows x64 and Linux x64.
     */
    isSupported(): boolean {
        const supported =
            (window.process.platform === "win32" || window.process.platform === "linux") &&
            window.process.arch === "x64";
        if (!supported) {
            log(this.name, `Not supported on platform '${window.process.platform}', arch '${window.process.arch}'`);
        }
        return supported;
    }

    /**
     * XVDTool asks before updating, tolerates an older build when GitHub is unreachable, and
     * gives the release lookup 1500ms.
     */
    protected checkDefaults(): DefaultCheckOptions {
        return {
            promptForUpdate: true,
            allowOutdated: true,
            releaseFetchTimeout: 1500,
            checkForUpdates: true,
        };
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
        return "XVDTool" + (window.process.platform === "win32" ? ".exe" : "");
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
                log(this.name, `Release ${release.tagName} asset '${asset.name}' matches ${platform} ${arch}`);
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
            return semver.compare(current, latest);
        } catch (error) {
            // If tags are not valid semver, fallback to string comparison.
            const result = current.localeCompare(latest);
            log(
                this.name,
                `'${current}' and '${latest}' are not both semver (${error instanceof Error ? error.message : String(error)}), ` +
                    `compared as text instead: ${result}`
            );
            return result;
        }
    }

    /**
     * Post-install hook: on Linux, marks the XVDTool executable as executable
     * (`chmod 755`) since GitHub release tarballs do not preserve permissions.
     */
    protected onInstalled(context: ToolInstalledContext): Promise<void> {
        if (process.platform !== "linux") return Promise.resolve();

        const exe = this.getExecutable();
        log(this.name, `${context.action} '${context.version}', marking '${exe}' executable for Linux`);
        return fs.promises.chmod(exe, 0o755).catch(error => {
            log(this.name, `chmod 755 on '${exe}' failed: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        });
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
    async decryptFile(
        inputFile: string,
        cikKeys: Record<string, string>,
        checkForUpdates: boolean = false
    ): Promise<string | null> {
        log(
            this.name,
            `Decrypting '${inputFile}' with ${Object.keys(cikKeys).length} known CIK keys, checkForUpdates=${checkForUpdates}`
        );

        // Ensure XVDTool is installed (and optionally up-to-date) before running.
        const { executable: xvdtoolExecutable } = await this.check({
            checkForUpdates,
        });

        const entries = Object.entries(cikKeys);
        if (entries.length === 0) {
            log(this.name, `No CIK keys were supplied for '${inputFile}', so it cannot be decrypted`);
            throw new Error("Decryption failed: no CIK keys were provided.");
        }

        // `-nd -eu` rewrites the input in place. A key that fails after touching the file leaves
        // the remaining keys nothing valid to work on, so the state is recorded before each try.
        const original = await this.fileState(inputFile);

        let lastError = "";
        let attempt = 0;
        for (const [cikUuid, cikData] of entries) {
            attempt += 1;

            if (attempt > 1) {
                const current = await this.fileState(inputFile);
                if (current !== original) {
                    log(
                        this.name,
                        `'${inputFile}' changed from ${original} to ${current} during the first ${attempt - 1} attempt(s)`
                    );
                    throw new Error(
                        `Decryption failed: a CIK key rewrote "${inputFile}" before failing, so the remaining ` +
                            `${entries.length - attempt + 1} key(s) cannot be tried against it. ` +
                            `Delete the file and download it again. Last error: ${lastError}`
                    );
                }
            }

            log(this.name, `Trying CIK ${cikUuid} (${attempt} of ${entries.length}) on '${inputFile}'`);
            try {
                await this.runTool("decrypting", xvdtoolExecutable, [
                    "-nd",
                    "-eu",
                    "-cik",
                    cikUuid,
                    "-cikdata",
                    cikData,
                    inputFile,
                ]);
                log(this.name, `Decrypted '${inputFile}' with CIK ${cikUuid}`);
                return null;
            } catch (err) {
                lastError = err instanceof Error ? err.message : String(err);
                log(this.name, `CIK ${cikUuid} did not decrypt '${inputFile}': ${lastError}`);
            }
        }

        log(this.name, `None of the ${entries.length} CIK keys decrypted '${inputFile}'`);
        throw new Error(
            `Decryption failed: none of the ${entries.length} known CIK keys worked. Last error: ${lastError}`
        );
    }

    /** Size and modification time, which is what tells an untouched file from a rewritten one. */
    private async fileState(file: string): Promise<string> {
        try {
            const stats = await fs.promises.stat(file);
            return `${stats.size} bytes at ${stats.mtimeMs}`;
        } catch (error) {
            log(this.name, `Could not stat '${file}': ${describeError(error)}`);
            return "unreadable";
        }
    }

    /**
     * Runs XVDTool once and reports what it did. Every exit is an outcome: a tool that cannot
     * start, one that reports an error line, one that ends non-zero and one that stops
     * responding all arrive here as a thrown error rather than a promise nobody settles.
     */
    private async runTool(status: AppStatusType, executable: string, args: string[]): Promise<void> {
        log(this.name, `Running ${executable} ${redactCik(args).join(" ")}`);

        await ProgressBar.runAsync(async ({ setStatus, setMessage, setProgress }) => {
            setStatus(status);
            const toolErrors: string[] = [];

            const result = await run(executable, args, {
                timeoutMs: XVDTOOL_TIMEOUT_MS,
                redactArgs: redactCik,
                // Both streams: the JSON protocol is documented as arriving on either.
                onLine: line => {
                    const error = this.consumeLine(line, setMessage, setProgress);
                    if (error) toolErrors.push(error);
                },
            });

            if (result.spawnError || result.timedOut || result.code !== 0 || toolErrors.length > 0) {
                log(this.name, `Run failed with ${toolErrors.length} reported errors.\n${describeResult(result)}`);
            }

            if (result.spawnError) throw new Error(`XVDTool could not be started (${result.spawnError}).`);
            if (result.timedOut) {
                throw new Error(
                    `XVDTool stopped responding and was closed after ${XVDTOOL_TIMEOUT_MS / 60_000} minutes.`
                );
            }
            if (toolErrors.length > 0) throw new Error(toolErrors.join("; "));
            if (result.code !== 0) throw new Error(`XVDTool ended with code ${result.code}. ${result.output}`.trim());

            log(this.name, `${executable} finished with code ${result.code} in ${result.durationMs}ms`);
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
                ...JSON.parse(line),
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
        log(this.name, `Tool error: ${detail}`);
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
    async extractFile(
        inputFile: string,
        outputFolder: string,
        checkForUpdates: boolean = false
    ): Promise<string | null> {
        log(this.name, `Extracting '${inputFile}' to '${outputFolder}', checkForUpdates=${checkForUpdates}`);

        // Ensure XVDTool is installed (and optionally up-to-date) before running.
        const { executable: xvdtoolExecutable } = await this.check({
            checkForUpdates,
        });

        await this.runTool("extracting", xvdtoolExecutable, ["-nd", "-xf", outputFolder, inputFile]);

        const written = fs.existsSync(outputFolder) ? fs.readdirSync(outputFolder).length : 0;
        if (written === 0) {
            log(
                this.name,
                `Extraction of '${inputFile}' reported success but '${outputFolder}' ` +
                    `${fs.existsSync(outputFolder) ? "is empty" : "does not exist"}`
            );
            throw new Error(`XVDTool reported success but nothing was written to ${outputFolder}.`);
        }
        log(this.name, `Extracted '${inputFile}' to '${outputFolder}', which now holds ${written} entries`);
        return null;
    }
}
