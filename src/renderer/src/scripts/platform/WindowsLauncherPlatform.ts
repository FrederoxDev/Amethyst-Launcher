import { Channel, CHANNELS } from "@renderer/scripts/domain/Channel";
import { Profile, isModded } from "@renderer/scripts/domain/Profile";
import { moveDirectory } from "@renderer/scripts/Directories";
import { log } from "@renderer/scripts/LauncherLog";
import { PathUtils } from "@renderer/scripts/PathUtils";
import { SESSION_SCHEMA, writeSession } from "@renderer/scripts/session/Session";
import { InstalledVersion } from "@renderer/scripts/versions/InstalledVersion";
import { describeError } from "@shared/diagnostics/Log";
import { DIRECTORY_PATHS, FILE_PATHS, ILauncherPlatform, LauncherPaths, LaunchOutcome, LaunchRequest, ProcessInfo } from "./LauncherPlatform";
import * as Licence from "./windows/Licence";
import * as Machine from "./windows/Machine";
import * as VersionFiles from "./windows/VersionFiles";

const os = window.require("os") as typeof import("os");
const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");

/**
 * The `unverified` verdict, said to the user. `Machine.startGame` reduces the verdict to a
 * boolean, so the words are repeated here rather than reached.
 */
const UNCONFIRMED_LAUNCH_MESSAGE =
    "Minecraft was asked to start, but the launcher could not check whether it did.\n\n"
    + "If Minecraft does not appear within a few seconds, press Play again.";

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

        for (const key of DIRECTORY_PATHS) PathUtils.ensureDirectory(paths[key]);
        for (const key of FILE_PATHS) PathUtils.ensureParentDirectory(paths[key]);
        WindowsLauncherPlatform.cachedPaths = paths;
        log("Paths", `Resolved from APPDATA ${appData}: ${Object.entries(paths).map(([k, v]) => `${k}=${v}`).join(", ")}`);
        return paths;
    }

    profileDataDir(profileUuid: string): string {
        return path.join(this.getPaths().profileDataPath, profileUuid);
    }

    foreignGameData(channel: Channel): string | null {
        return Machine.foreignDataPath(channel);
    }

    async adoptGameData(channel: Channel, profileUuid: string): Promise<void> {
        const source = Machine.foreignDataPath(channel);
        if (!source) {
            log("Adopt", `Nothing to adopt for ${channel}: its game data folder is not unowned data`);
            throw new Error(`No unowned ${channel} game data to adopt.`);
        }

        const target = this.profileDataDir(profileUuid);
        log("Adopt", `Adopting ${channel} game data at ${source} as profile ${profileUuid}`);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        await moveDirectory(source, target);

        // Whatever came in came from another install, licence file included, and that is the one
        // way a brand new profile starts life already holding an entitlement it did not earn.
        log("Adopt", `Moved ${channel} game data from ${source} into ${target}`);
        log("Adopt", `Licence files carried over: ${Licence.describeEntitlements(target)}`);

        // The folder the game reads from has just been emptied by the move, so it is pointed at
        // the profile that now owns it. Without this the data is only reachable through this
        // launcher, and anything else starting Minecraft - the Store shortcut included - creates
        // a fresh empty folder and presents it as a player who has lost every world they had.
        Machine.linkChannel(channel, target);
    }

    liveProfileFor(channel: Channel): string | null {
        const target = Machine.currentDataTarget(channel);
        if (!target) {
            log("Profiles", `No profile owns the ${channel} game data: it is not a junction to anywhere`);
            return null;
        }

        // Compared a path segment at a time. A textual prefix test makes "ProfileData-backup" a
        // child of "ProfileData", and the profile it names is then whichever folder happens to
        // sit at the end of somebody else's path.
        const root = this.getPaths().profileDataPath;
        const resolved = path.resolve(target);
        const relative = path.relative(root, resolved);
        if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
            log("Profiles", `The ${channel} game data points at ${resolved}, which is outside ${root}, so no profile owns it`);
            return null;
        }
        return relative.split(path.sep)[0];
    }

    /**
     * Only unhooks this profile's own junction. The package registration is left alone:
     * it still points at a valid build, and the next launch reconciles it.
     *
     * The data goes first and the junction after, so a delete that fails leaves the profile
     * exactly as it was and the user can try again. Unhooking first turned a delete that could
     * not finish into a profile still on the list with nothing behind it.
     */
    async discardProfileData(profileUuid: string): Promise<boolean> {
        const dir = this.profileDataDir(profileUuid);
        const live = CHANNELS.filter(channel => this.liveProfileFor(channel) === profileUuid);
        log(
            "Profiles",
            `Discarding the data of profile ${profileUuid} at ${dir}; it is the live data for `
            + `[${live.join(", ") || "no channel"}]`
        );

        try {
            await fs.promises.rm(dir, { recursive: true, force: true });
        } catch (e) {
            log("Profiles", `Could not delete ${dir}: ${describeError(e)}`);
            throw new Error(`This profile's data could not be deleted.\n\n${dir} (${describeError(e)})`, { cause: e });
        }
        log("Profiles", `Deleted ${dir}`);

        for (const channel of live) {
            try {
                Machine.unlinkChannel(channel);
            } catch (e) {
                // The data it pointed at is already gone, so a junction left behind is cleared by
                // the next launch rather than a reason to keep a profile with no data on the list.
                log("Profiles", `Could not unlink the ${channel} game data of profile ${profileUuid}: ${describeError(e)}`);
            }
        }
        return live.length > 0;
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
            log("Launch", `Could not check for a running Minecraft, launching anyway.\n${probe.detail}`);
            return null;
        }

        for (const proc of probe.processes) {
            // Running, but its build cannot be read, so which family it belongs to is unknown.
            if (proc.executablePath === "") {
                log("Launch", `pid ${proc.pid} is running Minecraft from an image path Windows would not report, treating it as a conflict`);
                return proc;
            }

            let family: string | null;
            try {
                family = Machine.packageFamilyFor(path.dirname(proc.executablePath));
            } catch (e) {
                log("Launch", `Could not read the package family of the build pid ${proc.pid} runs from (${proc.executablePath}): ${describeError(e)}`);
                family = null;
            }

            if (family === null || family.toLowerCase() === wantFamily) {
                log("Launch", `pid ${proc.pid} runs ${family ?? "an unreadable family"} from ${proc.executablePath}, which conflicts with ${wantFamily}`);
                return proc;
            }
            log("Launch", `pid ${proc.pid} runs ${family}, a different game from ${wantFamily}, so it is not a conflict`);
        }

        log("Launch", `No running Minecraft conflicts with ${wantFamily}`);
        return null;
    }

    private conflictError(running: ProcessInfo, profile: Profile, version: InstalledVersion): Error {
        if (running.executablePath === "") {
            log("Launch", `Refusing to launch "${profile.name}": pid ${running.pid} is Minecraft, build unknown`);
            return new Error(`Minecraft is already running. Close it before launching "${profile.name}".`);
        }

        const runningBuild = path.dirname(running.executablePath);
        const sameBuild = path.resolve(runningBuild).toLowerCase() === path.resolve(version.path).toLowerCase();

        if (sameBuild && this.liveProfileFor(profile.channel) === profile.uuid) {
            log("Launch", `Refusing to launch "${profile.name}": pid ${running.pid} is this same profile and build`);
            return new Error(`"${profile.name}" is already running.`);
        }

        log(
            "Launch",
            `Refusing to launch "${profile.name}" (${version.path}): pid ${running.pid} runs the same `
            + `${profile.channel} game from ${runningBuild}`
        );
        return new Error(
            `Another ${profile.channel} profile is already running from ${runningBuild}. ` +
            `Close it before launching "${profile.name}" (${version.label}).`
        );
    }

    async launch(request: LaunchRequest, onStatus?: (message: string) => void): Promise<LaunchOutcome> {
        const status = onStatus ?? (() => {});
        const { profile, version } = request;

        log(
            "Launch",
            `Launching "${profile.name}" (${profile.uuid}) on ${profile.channel}: build ${version.label} at ${version.path}, `
            + `runtime ${request.runtime ? `${request.runtime.id} from ${request.runtime.path}` : "none"}, `
            + `${request.mods.length} mods${request.mods.length > 0 ? ` (${request.mods.map(m => m.id).join(", ")})` : ""}, `
            + `developer mode ${request.developerMode ? "on" : "off"}, modded ${isModded(profile) ? "yes" : "no"}`
        );

        // Before anything reads the build: every step from here on opens a file inside it, and a
        // half-extracted folder would otherwise surface as whichever of those failed first.
        status(`Checking ${version.label}...`);
        VersionFiles.assertBuildUsable(version.path);

        status(`Checking whether a ${profile.channel} build is running...`);
        const conflict = await this.findConflictingGame(version);
        if (conflict) throw this.conflictError(conflict, profile, version);

        const dataDir = this.profileDataDir(profile.uuid);

        await Machine.reconcile({
            channel: profile.channel,
            versionPath: version.path,
            dataDir,
            modded: isModded(profile),
        }, status);

        // The runtime reads this to find out which mods to load, so a launch that cannot write it
        // would start a game that silently has no mods in it.
        try {
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
        } catch (e) {
            log("Launch", `Could not write the session file into ${dataDir}: ${describeError(e)}`);
            throw new Error(
                "This profile's folder could not be written to, so Minecraft was not started.\n\n"
                + "Check that the drive is not full and that antivirus software is not blocking the "
                + `launcher, then press Play again.\n\n${dataDir}`,
                { cause: e }
            );
        }
        log("Launch", `Session file written to ${dataDir} for "${profile.name}"`);

        status("Starting Minecraft...");
        // The manifest stays. It describes how this profile is set up, not one launch of it, so
        // starting the game from the Start menu afterwards loads the same mods the launcher did.
        const confirmed = await Machine.startGame(version.path, status);

        log(
            "Launch",
            confirmed
                ? `"${profile.name}" is running`
                : `"${profile.name}" was started, but Windows would not confirm that it is running`
        );
        return {
            confirmed,
            unconfirmedMessage: confirmed ? "" : UNCONFIRMED_LAUNCH_MESSAGE,
        };
    }
}
