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
    return path.join(getAmethystFolder(), "versions");
}

export function getModsFolder() {
    return path.join(getMinecraftFolder(), "AC", "Amethyst", "mods");
}

export function getLauncherConfig() {
    return path.join(getMinecraftFolder(), "AC", "Amethyst", "launcher_config.json")
}