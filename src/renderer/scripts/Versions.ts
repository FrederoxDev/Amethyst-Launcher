import {ensureDirectoryExists, LauncherFolder} from "./Paths";
import {SemVersion} from "./classes/SemVersion";

const fs = window.require('fs') as typeof import('fs');
const path = window.require('path') as typeof import('path');

export enum VersionType {
    Release = 0,
    Beta = 1,
    Preview = 2
}

export class MinecraftVersion {
    version: SemVersion;
    uuid: string;
    versionType: VersionType;

    constructor(version: SemVersion, uuid: string, versionType: VersionType) {
        this.version = version;
        this.uuid = uuid;
        this.versionType = versionType;
    }

    toString(): string {
        let prefix = "";
        if (this.versionType === VersionType.Beta) prefix = "-beta";
        else if (this.versionType === VersionType.Preview) prefix = "-preview";

        return `${this.version.toString()}${prefix}`
    }
}

export async function getAllMinecraftVersions() {
    const versionCacheFile = path.join(LauncherFolder, "cached_versions.json");
    ensureDirectoryExists(versionCacheFile);
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

        fs.writeFileSync(versionCacheFile, await data.text(),);
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
