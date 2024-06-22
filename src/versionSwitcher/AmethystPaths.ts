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
    return path.join(window.env["LocalAppData"], "Packages", "Microsoft.MinecraftUWP_8wekyb3d8bbwe");
}

export function getComMojangFolder() {
    return path.join(getMinecraftUWPFolder(), "LocalState", "games", "com.mojang");
}

export function getAmethystUWPFolder() {
    return path.join(getComMojangFolder(), "amethyst");
}

export function getVersionsFolder() {
    return path.join(getAmethystFolder(), "Versions");
}

export function getModsFolder() {
    return path.join(getAmethystUWPFolder(), "mods");
}

export function getLauncherConfig() {
    return path.join(getAmethystUWPFolder(), "launcher_config.json")
}

export function getLauncherFolder() {
    return path.join(getAmethystFolder(), "Launcher")
}
