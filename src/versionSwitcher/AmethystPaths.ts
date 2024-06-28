const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");

export function getAmethystFolder() {
    //@ts-ignore
    const amethystFolder = path.join(window.env["AppData"], "Amethyst");

    if (!fs.existsSync(amethystFolder)) {
        fs.mkdirSync(amethystFolder, {recursive: true});
    }

    return amethystFolder;
}

export function getMinecraftUWPFolder() {
    /**@ts-ignore */ 
    const folder = path.join(window.env["LocalAppData"], "Packages", "Microsoft.MinecraftUWP_8wekyb3d8bbwe");
    ensureDirectoryExists(folder);
    return folder;
}

export function getComMojangFolder() {
    const folder = path.join(getMinecraftUWPFolder(), "LocalState", "games", "com.mojang");
    ensureDirectoryExists(folder);
    return folder;
}

export function getAmethystUWPFolder() {
    const folder = path.join(getComMojangFolder(), "amethyst");
    ensureDirectoryExists(folder);
    return folder;
}

export function getVersionsFolder() {
    const folder = path.join(getAmethystFolder(), "Versions");
    ensureDirectoryExists(folder);
    return folder;
}

export function getModsFolder() {
    const folder = path.join(getAmethystUWPFolder(), "mods");
    ensureDirectoryExists(folder);
    return folder;
}

export function getLauncherConfig() {
    const folder = path.join(getAmethystUWPFolder(), "launcher_config.json")
    ensureDirectoryExists(folder);
    return folder;
}

export function getLauncherFolder() {
    const folder = path.join(getAmethystFolder(), "Launcher")
    ensureDirectoryExists(folder);
    return folder;
}


export function ensureDirectoryExists(filePath: string) {
    const dirname = path.dirname(filePath);
    fs.mkdirSync(dirname, {recursive: true});
}