import { log } from "@renderer/scripts/LauncherLog";
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
        if (cached) {
            log("Dotnet", `.NET ${requirement.channel} already resolved this run to '${cached}', not looking again`);
            return this.adopt(requirement.major, cached);
        }

        let pending = this.pending.get(requirement.major);
        if (pending) {
            log("Dotnet", `A search for .NET ${requirement.channel} is already running, waiting on it`);
        } else {
            pending = this.resolve(requirement).finally(() => this.pending.delete(requirement.major));
            this.pending.set(requirement.major, pending);
        }
        return pending;
    }

    private static async resolve(requirement: DotnetRequirement): Promise<string> {
        log("Dotnet", `${requirement.toolName} needs ${SHARED_FRAMEWORK} ${requirement.major}.x, looking for it`);

        const onDisk = this.findRootOnDisk(requirement.major);
        const existing = onDisk ?? (await this.findRootViaCli(requirement.major));
        if (existing) {
            log(
                "Dotnet",
                `Using the .NET ${requirement.channel} runtime at '${existing}', `
                + `found ${onDisk ? "in a known location" : "through dotnet --list-runtimes"}`
            );
            return this.adopt(requirement.major, existing);
        }

        log("Dotnet", `No .NET ${requirement.channel} runtime on this machine, installing a private copy to '${this.privateRoot()}'`);
        const installed = await this.install(requirement);
        return this.adopt(requirement.major, installed);
    }

    private static adopt(major: number, root: string): string {
        if (process.env.DOTNET_ROOT !== root) {
            log("Dotnet", `DOTNET_ROOT set to '${root}' for every process the launcher starts from here on`);
        }
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

    /** The framework versions a root holds, or why the question could not be answered. */
    private static frameworkVersions(root: string): { versions: string[]; problem: string | null } {
        try {
            return { versions: fs.readdirSync(path.join(root, "shared", SHARED_FRAMEWORK)), problem: null };
        } catch (error) {
            return { versions: [], problem: error instanceof Error ? error.message : String(error) };
        }
    }

    private static hasFramework(root: string, major: number): boolean {
        return this.frameworkVersions(root).versions.some(version => version.startsWith(`${major}.`));
    }

    /** One line for the whole sweep, listing every root and what it held. */
    private static findRootOnDisk(major: number): string | null {
        let found: string | null = null;
        const seen: string[] = [];

        for (const root of this.candidateRoots()) {
            const { versions, problem } = this.frameworkVersions(root);
            const matches = versions.filter(version => version.startsWith(`${major}.`));
            seen.push(`${root} -> ${problem ? `unavailable (${problem})` : versions.join(", ") || "no frameworks"}`);
            if (found === null && matches.length > 0) found = root;
        }

        log("Dotnet", `Looked for ${SHARED_FRAMEWORK} ${major}.x in ${seen.length} locations:\n    ${seen.join("\n    ")}`);
        return found;
    }

    /** Catches installs in locations the launcher does not know about, which the CLI still resolves. */
    private static async findRootViaCli(major: number): Promise<string | null> {
        const result = await run("dotnet", ["--list-runtimes"], { timeoutMs: LIST_RUNTIMES_TIMEOUT_MS });
        if (result.code !== 0) {
            // Expected when .NET is not installed at all, so this is a note rather than a failure.
            log("Dotnet", `dotnet --list-runtimes did not answer.\n${describeResult(result)}`);
            return null;
        }

        const listed: string[] = [];
        for (const line of result.output.split("\n")) {
            const match = line.match(/^Microsoft\.NETCore\.App (\d+)\.\S+ \[(.+)\]\s*$/);
            if (!match) continue;
            listed.push(line.trim());
            if (parseInt(match[1], 10) !== major) continue;

            const root = path.dirname(path.dirname(match[2].trim()));
            log("Dotnet", `dotnet --list-runtimes reported "${line.trim()}", which resolves to root '${root}'`);
            return root;
        }

        log(
            "Dotnet",
            `dotnet --list-runtimes reported no ${SHARED_FRAMEWORK} ${major}.x. It listed: `
            + `${listed.join("; ") || "no shared frameworks at all"}`
        );
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
            await fs.promises.rm(scriptPath, { force: true }).catch(error => {
                log("Dotnet", `Could not delete the installer script '${scriptPath}': ${this.describe(error)}`);
            });
        }

        if (!this.hasFramework(root, requirement.major)) {
            log(
                "Dotnet",
                `The installer finished but '${root}' holds `
                + `${this.frameworkVersions(root).versions.join(", ") || "no frameworks"}`
            );
            throw this.failure(requirement, "the installer finished but the runtime is still missing");
        }
        log("Dotnet", `Installed the .NET ${requirement.channel} runtime to '${root}'`);
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
                log("Dotnet", `Could not download ${scriptUrl}: ${this.describe(error)}`);
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

            log("Dotnet", `Running the .NET ${requirement.channel} installer: ${command} ${args.join(" ")}`);

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
            log("Dotnet", `The .NET ${requirement.channel} installer finished in ${result.durationMs}ms`);
        });
    }

    private static failure(requirement: DotnetRequirement, reason: string, output?: string): Error {
        log("Dotnet", `.NET ${requirement.channel} could not be installed: ${reason}${output ? `\n${output}` : ""}`);
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
