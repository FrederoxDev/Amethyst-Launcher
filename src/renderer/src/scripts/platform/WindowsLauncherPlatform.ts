import { Channel, CHANNELS } from "@renderer/scripts/domain/Channel";
import { Profile, isModded } from "@renderer/scripts/domain/Profile";
import { moveDirectory } from "@renderer/scripts/Directories";
import { PathUtils } from "@renderer/scripts/PathUtils";
import { SESSION_SCHEMA, writeSession } from "@renderer/scripts/session/Session";
import { InstalledVersion } from "@renderer/scripts/versions/InstalledVersion";
import { ILauncherPlatform, LauncherPaths, LaunchRequest, ProcessInfo } from "./LauncherPlatform";
import * as Machine from "./windows/Machine";

const os = window.require("os") as typeof import("os");
const fs = window.require("fs") as typeof import("fs");
const child = window.require("child_process") as typeof import("child_process");
const path = window.require("path") as typeof import("path");

const GAME_EXECUTABLE = "Minecraft.Windows.exe";

export class WindowsLauncherPlatform implements ILauncherPlatform {
    private static cachedPaths: LauncherPaths | null = null;

    getPlatformFullName(): string {
        return `Windows ${os.release()} (${os.arch()})`;
    }

    async runCommand(command: string, stdout?: (data: string) => void): Promise<number> {
        return new Promise((resolve, reject) => {
            const [cmd, ...args] = command.split(" ");
            const proc = child.spawn(cmd, args, { shell: true });
            if (stdout) proc.stdout?.on("data", data => stdout(data.toString()));
            proc.stderr?.on("data", data => console.error(`[Command] ${data}`));
            proc.on("close", code => {
                if (code !== 0) reject(new Error(`Command failed with exit code ${code}.`));
                else resolve(0);
            });
        });
    }

    getPaths(): LauncherPaths {
        if (WindowsLauncherPlatform.cachedPaths) return WindowsLauncherPlatform.cachedPaths;

        const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
        const launcher = path.join(appData, "Amethyst", "Launcher");

        const paths: LauncherPaths = {
            amethystPath: path.join(appData, "Amethyst"),
            launcherPath: launcher,
            versionsPath: path.join(launcher, "Versions"),
            versionsFilePath: path.join(launcher, "Versions", "versions.json"),
            cachedVersionsFilePath: path.join(launcher, "Versions", "cached_versions.json"),
            profilesFilePath: path.join(launcher, "Profiles", "profiles.json"),
            modsPath: path.join(launcher, "Mods"),
            launcherConfigPath: path.join(launcher, "launcher_config.json"),
            toolsPath: path.join(launcher, "Tools"),
            profileDataPath: path.join(launcher, "ProfileData"),
        };

        for (const p of Object.values(paths)) PathUtils.ValidatePath(p);
        WindowsLauncherPlatform.cachedPaths = paths;
        return paths;
    }

    listProcesses(executableName: string): Promise<ProcessInfo[]> {
        // tasklist reports tombstoned processes (fully exited, kept alive by a leaked
        // handle), so each hit is confirmed against WMI, which also yields the image path.
        return new Promise(resolve => {
            const proc = child.spawn(
                "tasklist",
                ["/FI", `IMAGENAME eq ${executableName}`, "/FO", "CSV", "/NH"],
                { encoding: "utf-8" } as never
            );

            let out = "";
            proc.stdout?.on("data", (data: string | Buffer) => { out += data.toString(); });
            proc.on("error", () => resolve([]));
            proc.on("close", () => {
                const text = out.trim();
                if (!text || text.includes("No tasks")) return resolve([]);

                const pids = text.split("\n")
                    .map(line => parseInt(line.match(/^"[^"]+","(\d+)"/)?.[1] ?? "-1", 10))
                    .filter(pid => pid > 0);

                Promise.all(pids.map(pid => this.inspectProcess(pid)))
                    .then(found => resolve(found.filter((p): p is ProcessInfo => p !== null)));
            });
        });
    }

    private inspectProcess(pid: number): Promise<ProcessInfo | null> {
        return new Promise(resolve => {
            const proc = child.spawn("powershell", [
                "-NoProfile", "-NonInteractive", "-Command",
                `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" -Property ThreadCount,ExecutablePath; ` +
                `"$($p.ThreadCount)\`t$($p.ExecutablePath)"`,
            ], { encoding: "utf-8" } as never);

            let out = "";
            proc.stdout?.on("data", (data: string | Buffer) => { out += data.toString(); });
            // Fail closed: if WMI is unavailable, treat the process as real but unidentified.
            proc.on("error", () => resolve({ pid, executablePath: "" }));
            proc.on("close", () => {
                const [threadText, executablePath = ""] = out.trim().split("\t");
                const threads = parseInt(threadText, 10);
                const alive = Number.isNaN(threads) ? true : threads > 0;
                resolve(alive ? { pid, executablePath: executablePath.trim() } : null);
            });
        });
    }

    profileDataDir(profileUuid: string): string {
        return path.join(this.getPaths().profileDataPath, profileUuid);
    }

    foreignGameData(channel: Channel): string | null {
        return Machine.foreignDataPath(channel);
    }

    async adoptGameData(channel: Channel, profileUuid: string): Promise<void> {
        const source = Machine.foreignDataPath(channel);
        if (!source) throw new Error(`No unowned ${channel} game data to adopt.`);

        const target = this.profileDataDir(profileUuid);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        await moveDirectory(source, target);
    }

    liveProfileFor(channel: Channel): string | null {
        const target = Machine.currentDataTarget(channel);
        if (!target) return null;

        const root = path.resolve(this.getPaths().profileDataPath).toLowerCase();
        const resolved = path.resolve(target);
        if (!resolved.toLowerCase().startsWith(root)) return null;
        return path.basename(resolved);
    }

    /**
     * Only unhooks this profile's own junction. The package registration is left alone:
     * it still points at a valid build, and the next launch reconciles it.
     */
    async discardProfileData(profileUuid: string): Promise<boolean> {
        let wasLive = false;
        for (const channel of CHANNELS) {
            if (this.liveProfileFor(channel) !== profileUuid) continue;
            Machine.unlinkChannel(channel);
            wasLive = true;
        }

        await fs.promises.rm(this.profileDataDir(profileUuid), { recursive: true, force: true });
        return wasLive;
    }

    /**
     * A running game of the *same* family holds the slots this launch would change — its
     * junction, its registration, the dxgi.dll in its build. A game of the other family
     * shares none of them, so preview running is no reason to refuse a release launch.
     */
    private async findConflictingGame(version: InstalledVersion): Promise<ProcessInfo | null> {
        const wantFamily = Machine.packageFamilyFor(version.path).toLowerCase();

        for (const proc of await this.listProcesses(GAME_EXECUTABLE)) {
            // Unidentifiable processes are treated as conflicting rather than stomped on.
            if (proc.executablePath === "") return proc;

            let family: string | null;
            try {
                family = Machine.packageFamilyFor(path.dirname(proc.executablePath));
            } catch {
                family = null;
            }

            if (family === null || family.toLowerCase() === wantFamily) return proc;
        }

        return null;
    }

    private conflictError(running: ProcessInfo, profile: Profile, version: InstalledVersion): Error {
        if (running.executablePath === "") {
            return new Error(`Minecraft is already running. Close it before launching "${profile.name}".`);
        }

        const runningBuild = path.dirname(running.executablePath);
        const sameBuild = path.resolve(runningBuild).toLowerCase() === path.resolve(version.path).toLowerCase();

        if (sameBuild && this.liveProfileFor(profile.channel) === profile.uuid) {
            return new Error(`"${profile.name}" is already running.`);
        }

        return new Error(
            `Another ${profile.channel} profile is already running from ${runningBuild}. ` +
            `Close it before launching "${profile.name}" (${version.label}).`
        );
    }

    async launch(request: LaunchRequest, onStatus?: (message: string) => void): Promise<void> {
        const status = onStatus ?? (() => {});
        const { profile, version } = request;

        status(`Checking whether a ${profile.channel} build is running...`);
        const conflict = await this.findConflictingGame(version);
        if (conflict) throw this.conflictError(conflict, profile, version);

        const dataDir = this.profileDataDir(profile.uuid);

        await Machine.reconcile({
            channel: profile.channel,
            versionPath: version.path,
            dataDir,
            proxy: isModded(profile),
        }, status);

        writeSession(dataDir, {
            schema: SESSION_SCHEMA,
            launchedAt: new Date().toISOString(),
            profile: { uuid: profile.uuid, name: profile.name },
            channel: profile.channel,
            version: { uuid: version.uuid, label: version.label, path: version.path },
            runtime: request.runtime,
            mods: request.mods,
        });

        status("Starting Minecraft...");
        Machine.activate(version.path);
    }
}
