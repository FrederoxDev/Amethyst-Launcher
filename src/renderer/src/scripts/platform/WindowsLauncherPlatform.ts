import { Channel, CHANNELS } from "@renderer/scripts/domain/Channel";
import { Profile, isModded } from "@renderer/scripts/domain/Profile";
import { moveDirectory } from "@renderer/scripts/Directories";
import { PathUtils } from "@renderer/scripts/PathUtils";
import { SESSION_SCHEMA, writeSession } from "@renderer/scripts/session/Session";
import { InstalledVersion } from "@renderer/scripts/versions/InstalledVersion";
import { ILauncherPlatform, LauncherPaths, LaunchRequest, ProcessInfo } from "./LauncherPlatform";
import * as Licence from "./windows/Licence";
import * as Machine from "./windows/Machine";

const os = window.require("os") as typeof import("os");
const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");

export class WindowsLauncherPlatform implements ILauncherPlatform {
    private static cachedPaths: LauncherPaths | null = null;

    getPlatformFullName(): string {
        return `Windows ${os.release()} (${os.arch()})`;
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

    /** Confirmed-running processes only. An unanswerable query yields an empty list, never a guess. */
    async listProcesses(executableName: string): Promise<ProcessInfo[]> {
        return (await Machine.probeProcesses(executableName)).processes;
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
     * A running game of the *same* family holds the slots this launch would change - its
     * junction, its registration, the dxgi.dll in its build. A game of the other family
     * shares none of them, so preview running is no reason to refuse a release launch.
     */
    private async findConflictingGame(version: InstalledVersion): Promise<ProcessInfo | null> {
        const wantFamily = Machine.packageFamilyFor(version.path).toLowerCase();
        const probe = await Machine.probeProcesses(Machine.GAME_EXECUTABLE);

        // Fail open. A launch blocked on a question Windows would not answer is a dead end the
        // user cannot clear, and a game that really is running is caught a few steps later by
        // Windows refusing to re-register a package it still holds, which says so plainly.
        if (probe.queryFailed) {
            console.error(
                `[Launch] Could not check for a running Minecraft, launching anyway.\n${probe.detail}`
            );
            return null;
        }

        for (const proc of probe.processes) {
            // Running, but its build cannot be read, so which family it belongs to is unknown.
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

        // Must follow reconcile so the junction is in place and the entitlement lands in
        // this profile's folder, and precede activation, which requires it.
        await Licence.ensureEntitlement(version.path, dataDir, status);

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
        await Machine.activate(version.path, status);
    }
}
