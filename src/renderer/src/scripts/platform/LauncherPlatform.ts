import { Profile } from "../Profiles";
import { InstalledVersionModel } from "../VersionManager";

export interface ShortcutOptions {
    name: string;
    target: string;
    args?: string;
    description?: string;
    icon?: string;
    workingDir?: string;
}

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
}

export interface ProcessInfo {
    /** Numeric process ID. */
    pid: number;
    /** Resolved working directory of the process (`/proc/<pid>/cwd`). */
    cwd: string;
    /** The executable name that was searched for. */
    executableName: string;
}

export interface ILauncherPlatform {
    getPlatformFullName(): string;
    runCommand(command: string, stdout?: (data: string) => void): Promise<number>;
    createShortcut(options: ShortcutOptions): Promise<void>;
    getPaths(): LauncherPaths;
    runProfile(profile: Profile, version: InstalledVersionModel, onStatus?: (message: string) => void): Promise<void>;
    isProcessRunning(executableName: string): Promise<ProcessInfo | null>;
}