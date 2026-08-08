import { useAppStore } from "@renderer/states/AppStore";
import { ProgressBar } from "@renderer/states/ProgressBarStore";
import { describeResult, run } from "@shared/diagnostics/ProcessRunner";
import { Downloader } from "./Downloader";

const fs = window.require("fs") as typeof import("fs");
const os = window.require("os") as typeof import("os");
const path = window.require("path") as typeof import("path");

const LIST_RUNTIMES_TIMEOUT_MS = 20_000;
const INSTALL_TIMEOUT_MS = 15 * 60_000;

const SHARED_FRAMEWORK = "Microsoft.NETCore.App";
const INSTALL_SCRIPT_WINDOWS = "https://dot.net/v1/dotnet-install.ps1";
const INSTALL_SCRIPT_UNIX = "https://dot.net/v1/dotnet-install.sh";

/** dotnet-install reports no numeric progress, so the phase lines it prints drive the bar instead. */
const INSTALL_PHASES: [RegExp, number][] = [
    [/^URL #\d/i, 0.2],
    [/Downloaded file/i, 0.6],
    [/Extracting/i, 0.8],
    [/Installation finished/i, 1],
];

/** A framework-dependent .NET app the launcher runs, and the shared runtime it needs. */
export interface DotnetRequirement {
    /** Major version of Microsoft.NETCore.App. Roll-forward never crosses a major, so this must match exactly. */
    major: number;
    /** dotnet-install channel, e.g. `"8.0"`. */
    channel: string;
    /** Tool name, used in the messages the user sees. */
    toolName: string;
}

/**
 * Finds, and when absent installs, the shared .NET runtime that the launcher's
 * bundled .NET tools need in order to start.
 *
 * A framework-dependent app resolves its runtime through `DOTNET_ROOT` or a
 * machine-wide install, never through `PATH`, so a discovered root is published
 * as `DOTNET_ROOT` for every process the launcher spawns afterwards.
 */
export class DotnetRuntime {
    private static resolved = new Map<number, string>();
    private static pending = new Map<number, Promise<string>>();

    /** Resolves to the .NET root that satisfies `requirement`, installing it if needed. */
    static async ensure(requirement: DotnetRequirement): Promise<string> {
        const cached = this.resolved.get(requirement.major);
        if (cached) return this.adopt(requirement.major, cached);

        let pending = this.pending.get(requirement.major);
        if (!pending) {
            pending = this.resolve(requirement).finally(() => this.pending.delete(requirement.major));
            this.pending.set(requirement.major, pending);
        }
        return pending;
    }

    private static async resolve(requirement: DotnetRequirement): Promise<string> {
        const existing = this.findRootOnDisk(requirement.major) ?? (await this.findRootViaCli(requirement.major));
        if (existing) {
            console.log(`[dotnet] Found .NET ${requirement.channel} runtime at '${existing}'.`);
            return this.adopt(requirement.major, existing);
        }

        console.log(`[dotnet] No .NET ${requirement.channel} runtime found; installing a private copy.`);
        const installed = await this.install(requirement);
        return this.adopt(requirement.major, installed);
    }

    private static adopt(major: number, root: string): string {
        process.env.DOTNET_ROOT = root;
        this.resolved.set(major, root);
        return root;
    }

    /** Where the launcher keeps the runtime it installed itself. */
    private static privateRoot(): string {
        return path.join(useAppStore.getState().platform.getPaths().toolsPath, "dotnet");
    }

    private static candidateRoots(): string[] {
        const roots: string[] = [];
        const add = (candidate: string | undefined | null): void => {
            if (candidate && !roots.includes(candidate)) roots.push(candidate);
        };

        add(process.env.DOTNET_ROOT);
        if (window.process.platform === "win32") {
            add(process.env.ProgramFiles ? path.join(process.env.ProgramFiles, "dotnet") : null);
            add(process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Microsoft", "dotnet") : null);
        } else {
            add("/usr/share/dotnet");
            add("/usr/lib/dotnet");
            add(path.join(os.homedir(), ".dotnet"));
        }
        add(this.privateRoot());

        return roots;
    }

    private static hasFramework(root: string, major: number): boolean {
        try {
            const versions = fs.readdirSync(path.join(root, "shared", SHARED_FRAMEWORK));
            return versions.some(version => version.startsWith(`${major}.`));
        } catch {
            return false;
        }
    }

    private static findRootOnDisk(major: number): string | null {
        for (const root of this.candidateRoots()) {
            if (this.hasFramework(root, major)) return root;
        }
        return null;
    }

    /** Catches installs in locations the launcher does not know about, which the CLI still resolves. */
    private static async findRootViaCli(major: number): Promise<string | null> {
        const result = await run("dotnet", ["--list-runtimes"], { timeoutMs: LIST_RUNTIMES_TIMEOUT_MS });
        if (result.code !== 0) {
            // Expected when .NET is not installed at all, so this is a note rather than a failure.
            console.log(`[dotnet] dotnet --list-runtimes did not answer.\n${describeResult(result)}`);
            return null;
        }

        for (const line of result.output.split("\n")) {
            const match = line.match(/^Microsoft\.NETCore\.App (\d+)\.\S+ \[(.+)\]\s*$/);
            if (!match || parseInt(match[1], 10) !== major) continue;
            return path.dirname(path.dirname(match[2].trim()));
        }
        return null;
    }

    private static async install(requirement: DotnetRequirement): Promise<string> {
        const root = this.privateRoot();
        const isWindows = window.process.platform === "win32";
        const scriptUrl = isWindows ? INSTALL_SCRIPT_WINDOWS : INSTALL_SCRIPT_UNIX;
        const scriptPath = path.join(os.tmpdir(), isWindows ? "dotnet-install.ps1" : "dotnet-install.sh");

        try {
            await this.runInstaller(requirement, scriptUrl, scriptPath, root, isWindows);
        } finally {
            await fs.promises.rm(scriptPath, { force: true });
        }

        if (!this.hasFramework(root, requirement.major)) {
            throw this.failure(requirement, "the installer finished but the runtime is still missing");
        }
        console.log(`[dotnet] Installed the .NET ${requirement.channel} runtime to '${root}'.`);
        return root;
    }

    private static async runInstaller(
        requirement: DotnetRequirement,
        scriptUrl: string,
        scriptPath: string,
        root: string,
        isWindows: boolean
    ): Promise<void> {
        await ProgressBar.useAsync(async ({ setStatus, setMessage, setProgress }) => {
            setStatus("downloading");
            setMessage(`Preparing the .NET ${requirement.channel} runtime...`);
            setProgress(0);

            try {
                await Downloader.downloadFile(scriptUrl, scriptPath);
            } catch (error) {
                throw this.failure(requirement, `the installer could not be downloaded (${this.describe(error)})`);
            }
            if (!isWindows) await fs.promises.chmod(scriptPath, 0o755);

            setStatus("extracting");
            setMessage(`Installing the .NET ${requirement.channel} runtime...`);
            setProgress(0.05);

            const command = isWindows ? "powershell" : "bash";
            const scriptArgs = isWindows
                ? ["-Runtime", "dotnet", "-Channel", requirement.channel, "-InstallDir", root, "-NoPath"]
                : ["--runtime", "dotnet", "--channel", requirement.channel, "--install-dir", root, "--no-path"];
            const args = isWindows
                ? ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath, ...scriptArgs]
                : [scriptPath, ...scriptArgs];

            const result = await run(command, args, {
                timeoutMs: INSTALL_TIMEOUT_MS,
                onLine: line => {
                    const phase = INSTALL_PHASES.find(([pattern]) => pattern.test(line));
                    if (phase) setProgress(phase[1]);
                },
            });

            if (result.timedOut) {
                throw this.failure(requirement, "the installer never finished", describeResult(result));
            }
            if (result.code !== 0) {
                throw this.failure(
                    requirement,
                    `the installer stopped with code ${result.code}`,
                    describeResult(result)
                );
            }
        });
    }

    private static failure(requirement: DotnetRequirement, reason: string, output?: string): Error {
        if (output) console.error(`[dotnet] Installer output:\n${output}`);
        return new Error(
            `${requirement.toolName} needs the .NET ${requirement.channel} runtime, and it could not be installed ` +
                `automatically because ${reason}. Install ".NET Runtime ${requirement.channel}" from ` +
                `https://dotnet.microsoft.com/download/dotnet/${requirement.channel} and try again.`
        );
    }

    private static describe(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
