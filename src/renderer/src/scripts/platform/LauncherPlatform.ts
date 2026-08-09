import { Channel } from "@renderer/scripts/domain/Channel";
import { Profile } from "@renderer/scripts/domain/Profile";
import { InstalledVersion } from "@renderer/scripts/versions/InstalledVersion";

export interface LauncherPaths {
    amethystPath: string;
    launcherPath: string;
    versionsPath: string;
    versionsFilePath: string;
    cachedVersionsFilePath: string;
    profilesFilePath: string;
    modsPath: string;
    launcherConfigPath: string;
    toolsPath: string;
    profileDataPath: string;
}

export interface ProcessInfo {
    pid: number;
    /** Full image path, so a running game can be traced back to the build it came from. */
    executablePath: string;
}

export interface LaunchRequest {
    profile: Profile;
    version: InstalledVersion;
    runtime: { id: string; path: string } | null;
    mods: { id: string; path: string }[];
    developerMode: boolean;
}

/** A channel's game data folder holds data that no profile owns. Recoverable by adopting it. */
export class ForeignGameDataError extends Error {
    constructor(readonly channel: Channel, readonly dataPath: string) {
        super(
            `Minecraft's ${channel} folder holds worlds and settings that no profile owns, so this profile `
            + `cannot use it.\n\nPress Play again and choose what to do with it, or move "${dataPath}" `
            + "somewhere else yourself."
        );
        this.name = "ForeignGameDataError";
    }
}

/**
 * The machine is missing a system setting the game needs, and fixing it needs administrator
 * rights. `repair` carries the platform's own fix so the launch flow can ask for consent and
 * apply it without knowing which platform raised this.
 */
export class SystemSetupRequiredError extends Error {
    constructor(
        readonly title: string,
        /** Shown to the user before the permission prompt appears, so it is never a surprise. */
        readonly explanation: string,
        /** What to do by hand, for when the launcher's own repair does not take. */
        readonly manualStep: string,
        readonly repair: (onStatus: (message: string) => void) => Promise<void>,
    ) {
        super(title);
        this.name = "SystemSetupRequiredError";
    }
}

export interface ILauncherPlatform {
    getPlatformFullName(): string;
    getPaths(): LauncherPaths;
    /** Every live process with this image name. Both games run the same executable name. */
    listProcesses(executableName: string): Promise<ProcessInfo[]>;

    /** Where a profile's game data lives. */
    profileDataDir(profileUuid: string): string;

    /** Game data present for a channel that no profile owns, or null. */
    foreignGameData(channel: Channel): string | null;

    /** Adopts foreign game data as the given profile's data. */
    adoptGameData(channel: Channel, profileUuid: string): Promise<void>;

    /** Deletes a profile's data. Returns true if it was the live data for a channel. */
    discardProfileData(profileUuid: string): Promise<boolean>;

    /** Which profile's data a channel currently points at, or null. */
    liveProfileFor(channel: Channel): string | null;

    launch(request: LaunchRequest, onStatus?: (message: string) => void): Promise<void>;
}
