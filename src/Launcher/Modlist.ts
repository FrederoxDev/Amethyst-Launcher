import { getAmethystFolder, getMinecraftFolder } from "../VersionSwitcher/VersionManager";
import { ModConfig } from "../types/ModConfig";
import { Profile } from "../types/Profile";
import { LauncherConfig } from "../types/LauncherConfig";
import { MinecraftVersion, VersionType } from "../types/MinecraftVersion";
import { SemVersion } from "../types/SemVersion";
const fs = window.require('fs') as typeof import('fs');
const path = window.require('path') as typeof import('path');

type ModList = {
    runtimeMods: string[],
    mods: string[]
}

export function findAllMods(): ModList {
    const mods: ModList = {
        mods: [],
        runtimeMods: []
    };

    const modsFolder = path.join(getMinecraftFolder(), 'AC', 'Amethyst', 'mods');
    if(!fs.existsSync(modsFolder)) return { mods: [], runtimeMods: [] };

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

export function findAllProfiles(): Profile[] {
    const profilesFile = path.join(getAmethystFolder(), "profiles.json");
    if (!fs.existsSync(profilesFile)) return [];

    const jsonData = fs.readFileSync(profilesFile, "utf-8");
    try {
        const profiles = JSON.parse(jsonData);
        return profiles;
    }
    catch {
        return [];
    }
}

export function saveAllProfiles(profiles: Profile[]) {
    const profilesFile = path.join(getAmethystFolder(), "profiles.json");
    fs.writeFileSync(profilesFile, JSON.stringify(profiles, undefined, 4));
}

export function saveLauncherConfig(config: LauncherConfig) {
    const configPath = path.join(getMinecraftFolder(), "AC", "Amethyst");

    fs.mkdirSync(configPath, { recursive: true });
    fs.writeFileSync(configPath + "/launcher_config.json", JSON.stringify(config, undefined, 4));
}

export function readLauncherConfig(): LauncherConfig {
    const configPath = path.join(getMinecraftFolder(), "AC", "Amethyst", "launcher_config.json");
    let data: LauncherConfig = {};
    
    try {
      const jsonData = fs.readFileSync(configPath, 'utf-8');
      data = JSON.parse(jsonData);
    } catch {}

    return {
        developer_mode: data["developer_mode"] ?? false,
        keep_open: data["keep_open"] ?? true,
        mods: data["mods"] ?? [],
        runtime: data["runtime"] ?? "Vanilla"
    }
}

export async function getAllMinecraftVersions() {
    const versionCacheFile = path.join(getAmethystFolder(), "cached_versions.json");
    let lastWriteTime: Date = new Date(0);

    if (fs.existsSync(versionCacheFile)) {
        const fileInfo = fs.statSync(versionCacheFile);
        lastWriteTime = fileInfo.mtime;
    }

    // Only fetch the data every hour
    const currentTime = new Date();
    const discardOldDataTime = new Date(currentTime.getTime() - 60 * 60 * 1000);

    console.log(lastWriteTime, discardOldDataTime, lastWriteTime < discardOldDataTime);

    if (lastWriteTime < discardOldDataTime) {
        console.log("Fetching minecraft versions from https://mrarm.io/r/w10-vdb");
        const data = await fetch("https://mrarm.io/r/w10-vdb");

        if (!data.ok) {
            throw new Error("Failed to fetch minecraft version data from https://mrarm.io/r/w10-vdb");
        }

        fs.writeFileSync(versionCacheFile, await data.text(), );
    }
    
    const versionData = fs.readFileSync(versionCacheFile, "utf-8");
    const rawJson = JSON.parse(versionData);
    const versions: MinecraftVersion[] = [];

    for (const version of rawJson) {
        versions.push(new MinecraftVersion(
            SemVersion.fromString(version[0] as string),
            version[1],
            version[2] as unknown as VersionType
        ));
    }

    return versions;
}