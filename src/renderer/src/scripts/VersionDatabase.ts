import { UseAppState } from "@renderer/contexts/AppState";
import { SemVersion } from "@renderer/scripts/classes/SemVersion";
import { IJSONModel } from "@renderer/scripts/contracts/IJSONModel";

const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");
const { createHash } = window.require("crypto") as typeof import("crypto");

function getPaths() {
    return UseAppState.getState().platform.getPaths();
}

export type MinecraftVersionType = "preview" | "release";
export class MinecraftVersionData implements IJSONModel {
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
        const currentTime = new Date();
        const discardOldDataTime = new Date(currentTime.getTime() - VersionCacheModel.REFRESH_INTERVAL_MINUTES * 60 * 1000);
        return this.lastUpdated < discardOldDataTime;
    }

    toString(): string {
        return `VersionCacheModel with ${this.versions.length} versions, last updated at ${this.lastUpdated.toISOString()} and hash ${this.hash()}`;
    }

    hash(): string {
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

        const fetchRemoteDatabase = async (): Promise<VersionCacheModel> => {
            try {
                const response = await fetch(VersionDatabase.DATABASE_URL);
                if (!response.ok) {
                    throw new Error(`Failed to fetch version database from ${VersionDatabase.DATABASE_URL}: ${response.status} ${response.statusText}`);
                }
                const data: HistoricalVersionsContract = await response.json() as HistoricalVersionsContract;

                const fixVersionString = (version: string): string => {
                    return version.replace("Release ", "").replace("Preview ", "");
                }

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

        console.log(`Checking version database cache validity. Cache exists: ${!!cacheData}, Cache is outdated: ${cacheData?.isOutdated() ?? "N/A"}`);
        if (cacheData?.isOutdated()) {
            console.log("Cache is outdated, checking remote database version...");
            try {
                const response = await fetch(VersionDatabase.DATABASE_URL);
                if (!response.ok) {
                    throw new Error(`Failed to fetch version database from ${VersionDatabase.DATABASE_URL}: ${response.status} ${response.statusText}`);
                }
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

// export enum MinecraftVersionType {
//     GdkRelease = 0,
//     GdkPreview = 1,
// }

// export interface MinecraftVersion {
//     type: "gdk";
//     versionType: MinecraftVersionType;
//     version: SemVersion;
//     urls: string[];
//     uuid: string;
// }

// export interface VersionsList {
//     file_version: number;
//     previewVersions: RawVersion[];
//     releaseVersions: RawVersion[];
// }

// interface RawVersion {
//     version: string;
//     urls: string[];
// }

// export interface InstalledVersion {
//     path: string
//     version: MinecraftVersion
// }

// export class VersionsFileObject {
//     installed_versions: InstalledVersion[];
//     default_installation_path: string;

//     constructor(versions: InstalledVersion[], install_path: string) {
//         this.installed_versions = versions;
//         this.default_installation_path = install_path;
//     }

//     static fromString(string: string): VersionsFileObject {
//         const obj = JSON.parse(string) as VersionsFileObject;

//         const default_installation_path = obj.default_installation_path;

//         const installed_versions = obj.installed_versions.map(installed_version => {
//             const sem_version = SemVersion.fromString(SemVersion.toString(installed_version.version.version));
//             const minecraft_version: MinecraftVersion = {
//                 type: "gdk",
//                 version: sem_version,
//                 uuid: installed_version.version.uuid,
//                 versionType: installed_version.version.versionType,
//                 urls: installed_version.version.urls,
//             };

//             return {
//                 path: installed_version.path,
//                 version: minecraft_version,
//             } as InstalledVersion;
//         });

//         return {
//             default_installation_path: default_installation_path,
//             installed_versions: installed_versions,
//         } as VersionsFileObject;
//     }
// }

// // export interface InstalledVersion {
// //     path: string;
// //     version: UWPMinecraftVersion;
// // }

// // function ParseUwpVersionData(version: [string, string, MinecraftVersionType]): UWPMinecraftVersion {
// //     return {
// //         type: "uwp",
// //         version: SemVersion.fromString(version[0]),
// //         uuid: version[1],
// //         versionType: version[2],
// //     };
// // }

// function ParseVersionData(raw: RawVersion, type: MinecraftVersionType): MinecraftVersion | null {
//     const versionString = raw.version.replace(type === MinecraftVersionType.GdkRelease ? "Release " : "Preview ", "");

//     const uuidRegex = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;
//     const matches = raw.urls[0].match(uuidRegex);
//     const lastUuid = matches?.at(-1);

//     if (!lastUuid) {
//         console.log("Failed to find uuid in version urls, skipping version! Urls:", raw.urls);
//         return null;
//     }

//     return {
//         type: "gdk",
//         version: SemVersion.fromString(versionString),
//         versionType: type,
//         urls: raw.urls,
//         uuid: lastUuid,
//     };
// }

// export async function FetchMinecraftVersions(): Promise<MinecraftVersion[]> {
//     const paths = getPaths();
//     let lastWriteTime: Date = new Date(0);

//     if (fs.existsSync(paths.cachedVersionsFilePath)) {
//         const fileInfo = fs.statSync(paths.cachedVersionsFilePath);
//         lastWriteTime = fileInfo.mtime;
//     }

//     // Only fetch the data every hour
//     const currentTime = new Date();
//     const discardOldDataTime = new Date(currentTime.getTime() - 60 * 60 * 1000);

//     const gdkFetchUrl = "https://raw.githubusercontent.com/LukasPAH/minecraft-windows-gdk-version-db/refs/heads/main/historical_versions.json";

//     // read the version field in the file
//     let existingVersion = 0;
//     if (fs.existsSync(paths.cachedVersionsFilePath)) {
//         const fileData = fs.readFileSync(paths.cachedVersionsFilePath, "utf-8");
//         const jsonData = JSON.parse(fileData);
//         existingVersion = jsonData.file_version || 0;
//     }

//     const expectedVersion = 1;

//     if (lastWriteTime < discardOldDataTime || existingVersion !== expectedVersion) {
//         const rawGdkData = await fetch(gdkFetchUrl);
//         if (!rawGdkData.ok) {
//             throw new Error(`Failed to fetch GDK version list from: ${gdkFetchUrl}`);
//         }

//         const gdkData = JSON.parse(await rawGdkData.text()) as VersionsList;

//         if (gdkData.file_version !== 0) {
//             throw new Error(`GDK version list changed file version! Expected 0, got ${gdkData.file_version}`);
//         }

//         const allVersions: MinecraftVersion[] = [
//             ...gdkData.releaseVersions.map(v => ParseVersionData(v, MinecraftVersionType.GdkRelease)),
//             ...gdkData.previewVersions.map(v => ParseVersionData(v, MinecraftVersionType.GdkPreview)),
//         ].filter((v): v is MinecraftVersion => !!v);

//         fs.writeFileSync(paths.cachedVersionsFilePath, JSON.stringify(allVersions, undefined, 4));
//         return allVersions;
//     }

//     interface StringifiedVersion {
//         version: {
//             major: number;
//             minor: number;
//             patch: number;
//             build: number;
//         };
//     }

//     const versionData = JSON.parse(fs.readFileSync(paths.cachedVersionsFilePath, "utf-8")) as StringifiedVersion[];

//     return versionData.map(version => {
//         return {
//             ...version,
//             version: new SemVersion(
//                 version.version.major,
//                 version.version.minor,
//                 version.version.patch,
//                 version.version.build
//             ),
//         } as MinecraftVersion;
//     });
// }

// export function GetInstalledVersions(): InstalledVersion[] {
//     const paths = getPaths();
//     if (fs.existsSync(paths.versionsPath)) {
//         const version_list: InstalledVersion[] = [];

//         const version_dirs = fs
//             .readdirSync(paths.versionsPath, { withFileTypes: true })
//             .filter(entry => entry.isDirectory());

//         for (const version_dir of version_dirs) {
//             const dir_path = path.join(version_dir.parentPath, version_dir.name);

//             if (fs.existsSync(dir_path)) {
//                 if (version_dir.name.startsWith("Minecraft-")) {
//                     const sem_version = SemVersion.fromString(version_dir.name.slice("Minecraft-".length));

//                     const minecraft_version = FindMinecraftVersion(sem_version);

//                     if (minecraft_version) {
//                         version_list.push({
//                             path: dir_path,
//                             version: minecraft_version,
//                         });
//                     }
//                 }
//             }
//         }

//         return version_list;
//     } else {
//         return [];
//     }
// }

// export function ValidateVersionsFile(): void {
//     const paths = getPaths();
//     if (!fs.existsSync(paths.versionsFilePath)) {
//         const default_version_file: VersionsFileObject = {
//             installed_versions: [],
//             default_installation_path: paths.versionsPath,
//         };

//         const versions_file_string = JSON.stringify(default_version_file, undefined, 4);

//         fs.writeFileSync(paths.versionsFilePath, versions_file_string);
//     }

//     const installed_versions = GetInstalledVersionsFromFile().filter(version => {
//         fs.existsSync(version.path);
//     });

//     const old_versions = GetInstalledVersions();

//     for (const old_version of old_versions) {
//         if (installed_versions.find(version => version.version.version.toString() === old_version.version.version.toString()) === undefined) {
//             installed_versions.push({
//                 path: path.join(paths.versionsPath, `Minecraft-${old_version.version.version.toString()}`),
//                 version: old_version.version,
//             });
//         }
//     }

//     if (fs.existsSync(paths.versionsFilePath)) {
//         const version_file_text = fs.readFileSync(paths.versionsFilePath, "utf-8");
//         const version_file_data: VersionsFileObject = JSON.parse(version_file_text) as VersionsFileObject;

//         version_file_data.installed_versions = installed_versions;

//         fs.writeFileSync(paths.versionsFilePath, JSON.stringify(version_file_data, undefined, 4));
//     }
// }

// export function GetInstalledVersionsFromFile(): InstalledVersion[] {
//     const paths = getPaths();
//     let installed_versions: InstalledVersion[] = [];

//     if (fs.existsSync(paths.versionsFilePath)) {
//         const version_file_text = fs.readFileSync(paths.versionsFilePath, "utf-8");
//         const version_file_data: VersionsFileObject = VersionsFileObject.fromString(version_file_text);

//         installed_versions = version_file_data.installed_versions;
//     }
//     return installed_versions;
// }

// export function GetInstalledVersionPath(version: MinecraftVersion): string | undefined {
//     const versions = GetInstalledVersionsFromFile();

//     const version_path = versions.find(in_version => in_version.version.uuid === version.uuid)?.path;

//     if (!version_path) {
//         console.warn(`Version ${version.toString()} not found in installed versions`);
//     }

//     return version_path;
// }

// export function GetInstalledVersion(version: MinecraftVersion): InstalledVersion | undefined {
//     const versions = GetInstalledVersions();
//     const installed_version = versions.find(in_version => in_version.version.uuid === version.uuid);
//     return installed_version;
// }

// export function FindMinecraftVersion(semVersion: SemVersion): MinecraftVersion | undefined {
//     const paths = getPaths();
//     const versionData = fs.readFileSync(paths.cachedVersionsFilePath, "utf-8");
//     const rawJson = JSON.parse(versionData);

//     for (const version of rawJson) {
//         const parsedVer = version.version as {
//             major: number;
//             minor: number;
//             patch: number;
//             build: number;
//         };
//         if (new SemVersion(parsedVer.major, parsedVer.minor, parsedVer.patch, parsedVer.build).matches(semVersion)) {
//             return version as MinecraftVersion;
//         }
//     }

//     return undefined;
// }
