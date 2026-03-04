export interface ShortcutOptions {
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
}

export interface ILauncherPlatform {
    getPlatformFullName(): string;
    runCommand(command: string): Promise<void>;
    createShortcut(options: ShortcutOptions): Promise<void>;
    getPaths(): LauncherPaths;
}