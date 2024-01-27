import { getMinecraftFolder } from "../versionSwitcher/VersionManager";
import { ModConfig } from "../types/ModConfig";
const fs = window.require('fs') as typeof import('fs');
const path = window.require('path') as typeof import('path');

type Modlist = {
    runtimeMods: string[],
    mods: string[]
}

export function findAllMods(): Modlist {
    const mods: Modlist = {
        mods: [],
        runtimeMods: []
    };

    const modsFolder = path.join(getMinecraftFolder(), 'AC', 'Amethyst', 'mods');

    const allModNames = fs.readdirSync(modsFolder, { withFileTypes: true })
        .filter(f => f.isDirectory())
        .map(dir => dir.name);

    for (const modName of allModNames) {
        const itemPath = path.join(modsFolder, modName);
        let configData: ModConfig = {};

        // The mod has no versioning in its name so continue
        if (!modName.includes("@")) continue;

        // Ignore any folders without a mod.json file
        const modConfigPath = path.join(itemPath, "mod.json");
        if (!fs.existsSync(modConfigPath)) continue;

        // Read data from mod.json, if fails report to console
        try {
            const jsonData = fs.readFileSync(modConfigPath, "utf-8");
            configData = JSON.parse(jsonData);
        }
        catch {
            console.error(`Failed to read/parse the config for ${modName}`);
            continue;
        }

        // This is a runtime mod!
        if (configData?.meta?.is_runtime) {
            mods.runtimeMods.push(modName);
        }
        else {
            mods.mods.push(modName)
        }
    }

    return mods;
}