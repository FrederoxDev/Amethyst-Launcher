import { useAppStore } from "@renderer/states/AppStore";
import { SemVersion } from "@renderer/scripts/classes/SemVersion";
import { IJSONModel } from "@renderer/scripts/contracts/IJSONModel";

const fs = window.require("fs") as typeof import("fs");
const { createHash } = window.require("crypto") as typeof import("crypto");
const path = window.require("path") as typeof import("path");

function getPaths() {
    return useAppStore.getState().platform.getPaths();
}

export type MinecraftVersionType = "preview" | "release";
export class MinecraftVersionData implements IJSONModel {
    static readonly VERSION_REGEX = /(\d+)\.(\d+)\.(\d+)$/;
    static readonly CAL_VER_START_NUMBER = 26;

    version: SemVersion;
    uuid: string;
    type: MinecraftVersionType;
    urls: string[];

    constructor(version: SemVersion, uuid: string, type: MinecraftVersionType, urls: string[]) {
        this.version = version;
        this.uuid = uuid;
        this.type = type;
        this.urls = urls;
    }

    toString() {
        return MinecraftVersionData.toString(this);
    }

    static toString(version: MinecraftVersionData): string {
        return `${version.version.toString()}-${version.type}`
    }

    static fromObject(obj: any): MinecraftVersionData {
        if (!("version" in obj) || !("uuid" in obj) || !("type" in obj) || !("urls" in obj)) {
            throw new Error("Invalid version data object");
        }

        return new MinecraftVersionData(
            SemVersion.fromString(obj.version),
            obj.uuid,
            obj.type,
            obj.urls
        );
    }

    static toObject(version: MinecraftVersionData): any {
        return {
            version: version.version.toString(),
            uuid: version.uuid,
            type: version.type,
            urls: version.urls,
        };
    }

    toObject(): any {
        return MinecraftVersionData.toObject(this);
    }

    static fromJSON(json: string): MinecraftVersionData {
        const obj = JSON.parse(json);
        return MinecraftVersionData.fromObject(obj);
    }

    toJSON(): string {
        return JSON.stringify(this.toObject());
    }

    // Version prettify copied from https://github.com/LukasPAH/minecraft-windows-gdk-version-db/blob/main/getLatestVersion.ts
    static prettifyVersionNumbers(version: string): string | null {
        version = version.toLowerCase().replace("microsoft.minecraftuwp_", "").replace("microsoft.minecraftwindowsbeta_", "").replace(".0_x64__8wekyb3d8bbwe", "");

        const versionMatch = version.match(this.VERSION_REGEX);

        if (versionMatch === null) {
            return null;
        }

        const majorVersion = versionMatch[1];
        if (majorVersion === undefined) {
            return null;
        }

        const minorVersion = versionMatch[2];
        if (minorVersion === undefined) {
            return null;
        }

        const patchVersionUnprocessed = versionMatch[3];
        if (patchVersionUnprocessed === undefined) {
            return null;
        }

        const patchVersion = (parseInt(patchVersionUnprocessed) / 100).toFixed(2);

        let versionString = `${majorVersion}.${minorVersion}.${patchVersion}`;
        if (parseInt(minorVersion) >= this.CAL_VER_START_NUMBER) {
            versionString = `${minorVersion}.${patchVersion}`;
        }

        return versionString;
    }

    static buildVersionPath(versionHasError: boolean, format: string, type: string, uuid: string): string {
        return path.join(getPaths().versionsPath, `Minecraft-${!versionHasError ? format + "-" : "x.x.x.x-"}${type.toLowerCase()}-${uuid}.msixvc`);
    }
}

export class VersionCacheModel implements IJSONModel {
    public static REFRESH_INTERVAL_MINUTES = 30;
    versions: MinecraftVersionData[];
    lastUpdated: Date;
    fileVersion: number;

    constructor(versions: MinecraftVersionData[], lastUpdated: Date, fileVersion: number) {
        this.versions = versions;
        this.lastUpdated = lastUpdated;
        this.fileVersion = fileVersion;
    }

    isOutdated(): boolean {
        // We consider the cache outdated if it was last updated more than REFRESH_INTERVAL_MINUTES ago, 
        // this is to avoid hitting the remote database too often, especially since the version database doesn't change that often
        const currentTime = new Date();
        const discardOldDataTime = new Date(currentTime.getTime() - VersionCacheModel.REFRESH_INTERVAL_MINUTES * 60 * 1000);
        return this.lastUpdated < discardOldDataTime;
    }

    toString(): string {
        return `VersionCacheModel with ${this.versions.length} versions, last updated at ${this.lastUpdated.toISOString()} and hash ${this.hash()}`;
    }

    hash(): string {
        // We create a hash of the version cache data to be able to quickly compare if the cache is different from the remote database
        const hash = createHash("sha256");
        hash.update(JSON.stringify(this.lastUpdated));
        for (const version of this.versions) {
            hash.update(version.uuid.toString());
        }
        return hash.digest("hex");
    }

    static fromObject(obj: any): VersionCacheModel {
        if (!("versions" in obj) || !("last_updated" in obj)) {
            throw new Error("Invalid version cache object");
        }

        return new VersionCacheModel(
            obj.versions.map((v: any) =>
                MinecraftVersionData.fromObject(v)
            ),
            new Date(obj.last_updated),
            obj.file_version || 0
        );
    }

    static toObject(cache: VersionCacheModel): any {
        return {
            versions: cache.versions.map(v => v.toObject()),
            last_updated: cache.lastUpdated.toISOString(),
            file_version: cache.fileVersion,
        };
    }

    toObject(): any {
        return VersionCacheModel.toObject(this);
    }

    static fromJSON(json: string): VersionCacheModel {
        const obj = JSON.parse(json);
        return VersionCacheModel.fromObject(obj);
    }

    toJSON(): string {
        return JSON.stringify(this.toObject(), undefined, 4);
    }
}

// Contract for the version database file, this is the format of the JSON file that we fetch from the remote database
interface HistoricalVersionsContract {
    file_version: number;
    previewVersions: {
        version: string;
        urls: string[];
    }[];
    releaseVersions: {
        version: string;
        urls: string[];
    }[];
}

export class VersionDatabase {
    private static readonly DATABASE_URL: string = "https://raw.githubusercontent.com/LukasPAH/minecraft-windows-gdk-version-db/refs/heads/main/historical_versions.json";
    private Versions: VersionCacheModel;

    constructor() {
        this.Versions = new VersionCacheModel([], new Date(0), -1);
    }

    async update(): Promise<MinecraftVersionData[] | Error> {
        // First we will check if we have a valid cache of the version database, 
        const cachePath = getPaths().cachedVersionsFilePath;
        let cacheData: VersionCacheModel | null = null;
        if (fs.existsSync(cachePath)) {
            try {
                cacheData = VersionCacheModel.fromJSON(fs.readFileSync(cachePath, "utf-8"));
            }
            catch (e) {
                console.error("Failed to parse version cache file, ignoring cache. ", e);
            }
        }

        // Helper function to fetch the remote database and convert it to our internal model, 
        // we will use this in multiple places in the code below, so it's better to have it as a separate function
        const fetchRemoteDatabase = async (): Promise<VersionCacheModel> => {
            // Try to fetch the remote database, if this fails we will throw an error, if it succeeds we will convert the data to our internal model and return it
            try {
                const response = await fetch(VersionDatabase.DATABASE_URL);
                if (!response.ok) {
                    throw new Error(`Failed to fetch version database from ${VersionDatabase.DATABASE_URL}: ${response.status} ${response.statusText}`);
                }

                // Convert the data from the remote database to our internal model, 
                const data: HistoricalVersionsContract = await response.json() as HistoricalVersionsContract;
            
                // Helper function to fix the version strings from the remote database, 
                // this is needed because some versions might have prefixes like "Release " or "Preview " that we want to remove before parsing them as SemVersion
                const fixVersionString = (version: string): string => {
                    return version.replace("Release ", "").replace("Preview ", "");
                }

                // Join the release and preview versions from the remote database into a single array of MinecraftVersionData,
                const allVersions = [
                    ...data.releaseVersions.map(v => new MinecraftVersionData(SemVersion.fromString(fixVersionString(v.version)), v.urls[0].match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/)?.at(-1) ?? "", "release", v.urls)),
                    ...data.previewVersions.map(v => new MinecraftVersionData(SemVersion.fromString(fixVersionString(v.version)), v.urls[0].match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/)?.at(-1) ?? "", "preview", v.urls)),
                ];

                return new VersionCacheModel(allVersions, new Date(), data.file_version);
            }
            catch (e) {
                throw new Error("Failed to fetch version database. " + e);
            }
        }


        // Now we will check if the cache is valid, 
        // if it is we will use it, if it's not we will try to fetch the remote database, 
        // if that fails we will use the cache if it's available, 
        // if that also fails we will throw an error
        // (That's lot's of ifs lol)
        console.log(`Checking version database cache validity. Cache exists: ${!!cacheData}, Cache is outdated: ${cacheData?.isOutdated() ?? "N/A"}`);
        if (cacheData?.isOutdated()) {
            console.log("Cache is outdated, checking remote database version...");
            try {
                // Fetch shenanigans to check if the remote database is actually newer than the cache before we decide to use it,
                const response = await fetch(VersionDatabase.DATABASE_URL);
                if (!response.ok) {
                    throw new Error(`Failed to fetch version database from ${VersionDatabase.DATABASE_URL}: ${response.status} ${response.statusText}`);
                }

                // This actually double fetches but it's so small that who cares xD
                const data: HistoricalVersionsContract = await response.json() as HistoricalVersionsContract;
                if (cacheData.fileVersion < data.file_version) {
                    console.log(`Remote database version (${data.file_version}) is newer than cache version (${cacheData.fileVersion}), updating cache...`);
                    this.Versions = await fetchRemoteDatabase();
                    return this.Versions.versions;
                }
            }
            catch (e) {
                console.error("Failed to fetch version database, using cache if available. ", e);
                if (cacheData) {
                    console.log("Using cached version database due to fetch failure.");
                    this.Versions = cacheData;
                    return cacheData.versions;
                }
                return new Error(`Failed to fetch version database and no valid cache available. ${e}`);
            }
        }

        if (cacheData) {
            console.log("Using cached version database.");
            this.Versions = cacheData;
            return cacheData.versions;
        }

        console.warn("No version database cache available, and cache is not outdated but empty. This likely means the cache file was corrupted or invalid. Attempting to fetch remote database...");
        try {
            // If we reached this point, it means the cache is either not present or invalid, 
            // but it's also not outdated, which likely means the cache file was corrupted or invalid in some way, 
            // so we will attempt to fetch the remote database, if that fails we will throw an error since we have no valid cache to fall back to
            this.Versions = await fetchRemoteDatabase();
            fs.writeFileSync(cachePath, this.Versions.toJSON(), "utf-8");
            return this.Versions.versions;
        }
        catch (e) {
            console.error("Failed to fetch version database, and no valid cache available. ", e);
            return new Error(`Failed to fetch version database and no valid cache available. ${e}`);
        }
    }

    getVersionByUUID(uuid: string): MinecraftVersionData | null {
        return this.Versions.versions.find(version => version.uuid === uuid) ?? null;
    }

    getVersionBySemVersion(semVersion: SemVersion): MinecraftVersionData | null {
        return this.Versions.versions.find(version => version.version.matches(semVersion)) ?? null;
    }

    getAllVersions(): MinecraftVersionData[] {
        return this.Versions.versions;
    }
}