import { PathUtils } from "@renderer/scripts/PathUtils";
import { SESSION_SCHEMA, writeSession } from "@renderer/scripts/session/Session";
import { LauncherTools } from "@renderer/scripts/backend/tools/LauncherTools";
import { ILauncherPlatform, LauncherPaths, LaunchRequest, ProcessInfo } from "./LauncherPlatform";

const fs = window.require("fs") as typeof import("fs");
const os = window.require("os") as typeof import("os");
const path = window.require("path") as typeof import("path");

const GAME_EXECUTABLE = "Minecraft.Windows.exe";

/**
 * Each profile gets its own WINE prefix, so there is no shared data location for
 * channels to collide over and nothing to adopt.
 */
export class LinuxLauncherPlatform implements ILauncherPlatform {
    private static cachedPaths: LauncherPaths | null = null;

    getPlatformFullName(): string {
        const osRelease = "/etc/os-release";
        if (fs.existsSync(osRelease)) {
            for (const line of fs.readFileSync(osRelease, "utf-8").split("\n")) {
                if (line.startsWith("PRETTY_NAME=")) {
                    return `${line.split("=")[1].replace(/"/g, "")} ${os.release()} (${os.arch()})`;
                }
            }
        }
        return `Linux ${os.release()} (${os.arch()})`;
    }

    getPaths(): LauncherPaths {
        if (LinuxLauncherPlatform.cachedPaths) return LinuxLauncherPlatform.cachedPaths;

        const launcher = path.join(os.homedir(), ".amethyst", "launcher");
        const paths: LauncherPaths = {
            amethystPath: path.join(os.homedir(), ".amethyst"),
            launcherPath: launcher,
            versionsPath: path.join(launcher, "versions"),
            versionsFilePath: path.join(launcher, "versions", "versions.json"),
            cachedVersionsFilePath: path.join(launcher, "versions", "cached_versions.json"),
            profilesFilePath: path.join(launcher, "profiles", "profiles.json"),
            modsPath: path.join(launcher, "Mods"),
            launcherConfigPath: path.join(launcher, "launcher_config.json"),
            toolsPath: path.join(launcher, "tools"),
            profileDataPath: path.join(launcher, "profile_data"),
        };

        for (const p of Object.values(paths)) PathUtils.ValidatePath(p);
        LinuxLauncherPlatform.cachedPaths = paths;
        return paths;
    }

    async listProcesses(executableName: string): Promise<ProcessInfo[]> {
        const found: ProcessInfo[] = [];
        for (const pid of fs.readdirSync("/proc")) {
            if (!/^\d+$/.test(pid)) continue;
            try {
                const cwd = fs.readlinkSync(`/proc/${pid}/cwd`);
                const executablePath = path.join(cwd, executableName);
                if (fs.existsSync(executablePath)) found.push({ pid: parseInt(pid, 10), executablePath });
            } catch { /* exited mid-scan, or not ours to read */ }
        }
        return found;
    }

    profileDataDir(profileUuid: string): string {
        return path.join(this.getPaths().profileDataPath, profileUuid);
    }

    private prefixDir(profileUuid: string): string {
        return path.join(this.profileDataDir(profileUuid), "prefix");
    }

    foreignGameData(): string | null {
        return null;
    }

    async adoptGameData(): Promise<void> {
        throw new Error("There is no shared game data folder to adopt on Linux.");
    }

    liveProfileFor(): string | null {
        return null;
    }

    async discardProfileData(profileUuid: string): Promise<boolean> {
        await fs.promises.rm(this.profileDataDir(profileUuid), { recursive: true, force: true });
        return false;
    }

    async launch(request: LaunchRequest, onStatus?: (message: string) => void): Promise<void> {
        const status = onStatus ?? (() => {});
        const { profile, version } = request;

        const dataDir = this.profileDataDir(profile.uuid);
        const prefix = this.prefixDir(profile.uuid);

        status("Checking whether this profile is running...");
        const running = await this.listProcesses(GAME_EXECUTABLE);
        if (running.some(p => p.executablePath.startsWith(prefix))) {
            throw new Error(`"${profile.name}" is already running.`);
        }

        fs.mkdirSync(path.join(prefix, "dosdevices"), { recursive: true });

        writeSession(dataDir, {
            schema: SESSION_SCHEMA,
            launchedAt: new Date().toISOString(),
            profile: { uuid: profile.uuid, name: profile.name },
            channel: profile.channel,
            version: { uuid: version.uuid, label: version.label, path: version.path },
            runtime: request.runtime,
            mods: request.mods,
            developerMode: request.developerMode,
        });

        status("Starting Minecraft...");
        await LauncherTools.UMULauncher.runGame(path.join(version.path, GAME_EXECUTABLE), {
            WINEPREFIX: prefix,
        });
    }
}
