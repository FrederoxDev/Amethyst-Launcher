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

export function getMinecraftFolder() {
    /**@ts-ignore */ 
    return path.join(window.env["LocalAppData"], "Packages", "Microsoft.MinecraftUWP_8wekyb3d8bbwe");
}

export function getVersionsFolder() {
    return path.join(getAmethystFolder(), "Versions");
}

export function getModsFolder() {
    return path.join(getAmethystFolder(), "Mods");
}

export function getLauncherFolder() {
    return path.join(getAmethystFolder(), "Launcher");
}

export function getLauncherConfig() {
    return path.join(getLauncherFolder(), "launcher_config.json")
}
