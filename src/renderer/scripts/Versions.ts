import {ValidatePath, LauncherFolder, VersionsFolder} from "./Paths";
import { SemVersion } from "./classes/SemVersion";


const fs = window.require('fs') as typeof import('fs');
const path = window.require('path') as typeof import('path');

export enum MinecraftVersionType {
    Release = 0,
    Beta = 1,
    Preview = 2
}

export class MinecraftVersion {
    version: SemVersion;
    uuid: string;
    versionType: MinecraftVersionType;

    constructor(version: SemVersion, uuid: string, versionType: MinecraftVersionType) {
        this.version = version;
        this.uuid = uuid;
        this.versionType = versionType;
    }

    toString(): string {
        let prefix = "";
        if (this.versionType === MinecraftVersionType.Beta) prefix = "-beta";
        else if (this.versionType === MinecraftVersionType.Preview) prefix = "-preview";

        return `${this.version.toString()}${prefix}`
    }
}

export async function FetchMinecraftVersions() {
    const versionCacheFile = path.join(LauncherFolder, "cached_versions.json");
    ValidatePath(versionCacheFile);
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
        console.log("Fetching minecraft versions from https://raw.githubusercontent.com/AmethystAPI/Launcher-Data/main/versions.json.min");
        const data = await fetch("https://raw.githubusercontent.com/AmethystAPI/Launcher-Data/main/versions.json.min");

        if (!data.ok) {
            throw new Error("Failed to fetch minecraft version data from https://raw.githubusercontent.com/AmethystAPI/Launcher-Data/main/versions.json.min");
        }

        fs.writeFileSync(versionCacheFile, await data.text());
    }

    const versionData = fs.readFileSync(versionCacheFile, "utf-8");
    const rawJson = JSON.parse(versionData);
    const versions: MinecraftVersion[] = [];

    for (const version of rawJson) {
        versions.push(new MinecraftVersion(
            SemVersion.fromString(version[0] as string),
            version[1],
            version[2] as unknown as MinecraftVersionType
        ));
    }

    return versions;
}

export function GetInstalledVersions(): MinecraftVersion[] {
    if (fs.existsSync(VersionsFolder)) {
        const version_list: MinecraftVersion[] = [];

        const version_dirs = fs.readdirSync(VersionsFolder, { withFileTypes: true }).filter(entry => entry.isDirectory());

        for (const version_dir of version_dirs) {
            const dir_path = path.join(version_dir.parentPath, version_dir.name);

            if (fs.existsSync(dir_path)) {
                if (version_dir.name.startsWith('Minecraft-')) {
                    const sem_version = SemVersion.fromString(version_dir.name.slice('Minecraft-'.length));

                    const minecraft_version = FindMinecraftVersion(sem_version);

                    if (minecraft_version) {
                        version_list.push(minecraft_version);
                    }
                }
            }
        }

        return version_list;
    }
    else {
        return []
    }
}

export function FindMinecraftVersion(sem_version: SemVersion) {
    const versionCacheFile = path.join(LauncherFolder, "cached_versions.json");
    ValidatePath(versionCacheFile);

    const versionData = fs.readFileSync(versionCacheFile, "utf-8");
    const rawJson = JSON.parse(versionData);

    for (const version of rawJson) {
        if (version[0] as string === sem_version.toString())

        return new MinecraftVersion(
            SemVersion.fromString(version[0] as string),
            version[1],
            version[2] as unknown as MinecraftVersionType
        )
    }
}
