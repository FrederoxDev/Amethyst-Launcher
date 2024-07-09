const fs = window.require('fs') as typeof import('fs')
const path = window.require('path') as typeof import('path')

export const AmethystFolder: string = getAmethystFolder();
export const AmethystUWPFolder: string = getAmethystUWPFolder();
export const MinecraftUWPFolder: string = getMinecraftUWPFolder();

export const LauncherFolder: string = getLauncherFolder();
export const VersionsFolder: string = getVersionsFolder();
export const ModsFolder: string = getModsFolder();

export const LauncherConfigPath: string = getLauncherConfig();

export function getAmethystFolder(): string {
    //@ts-expect-error window.env
    const amethystFolder = path.join(window.env["AppData"], "Amethyst");

    if (!fs.existsSync(amethystFolder)) {
        fs.mkdirSync(amethystFolder, {recursive: true});
    }

    return amethystFolder;
}

export function getMinecraftUWPFolder(): string {
    //@ts-expect-error window.env
    const folder = path.join(window.env["LocalAppData"], "Packages", "Microsoft.MinecraftUWP_8wekyb3d8bbwe");
    ensureDirectoryExists(folder);
    return folder;
}

export function getComMojangFolder(): string {
    const folder = path.join(getMinecraftUWPFolder(), "LocalState", "games", "com.mojang");
    ensureDirectoryExists(folder);
    return folder;
}

export function getAmethystUWPFolder(): string {
    const folder = path.join(getComMojangFolder(), "amethyst");
    ensureDirectoryExists(folder);
    return folder;
}

export function getVersionsFolder(): string {
    const folder = path.join(getAmethystFolder(), "Versions");
    ensureDirectoryExists(folder);
    return folder;
}

export function getModsFolder(): string {
    const folder = path.join(getAmethystUWPFolder(), "mods");
    ensureDirectoryExists(folder);
    return folder;
}

export function getLauncherConfig(): string {
    const folder = path.join(getAmethystUWPFolder(), "launcher_config.json")
    ensureDirectoryExists(folder);
    return folder;
}

export function getLauncherFolder(): string {
    const folder = path.join(getAmethystFolder(), "Launcher")
    ensureDirectoryExists(folder);
    return folder;
}


export function ensureDirectoryExists(filePath: string): void {
    const dirname = path.dirname(filePath);
    fs.mkdirSync(dirname, {recursive: true});
}