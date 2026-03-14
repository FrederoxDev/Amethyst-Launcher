import { SemVersion } from "@renderer/scripts/classes/SemVersion";
import { MinecraftVersionData, MinecraftVersionType, VersionDatabase } from "@renderer/scripts/VersionDatabase";
import { useAppStore } from "@renderer/states/AppStore";
import { PathUtils } from "./PathUtils";
import { XVDTool } from "./backend/tools/XVDTool";
import { CIK_KEYS } from "./backend/Decryption";
import { Downloader } from "./backend/Downloader";
import { IJSONModel } from "./contracts/IJSONModel";
import { FileLocker } from "./FileLocker";
import { FULL_PROGRESS_RESET_OPTIONS, ProgressBar } from "@renderer/states/ProgressBarStore";
import { LauncherTools } from "./backend/tools/LauncherTools";

const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");

function getPaths() {
    return useAppStore.getState().platform.getPaths();
}

export interface ImportedVersionInstallationData {
    kind: "imported";
    uuid: string;
    name: string;
    version: SemVersion;
    type: MinecraftVersionType;
    file: string;
};

export interface DownloadedVersionInstallationData {
    kind: "downloaded";
    uuid: string;
    name: string;
    version: SemVersion;
    type: MinecraftVersionType;
    from: string;
    path: string;
}

type VersionInstallationData = ImportedVersionInstallationData | DownloadedVersionInstallationData;

export class InstalledVersionModel implements IJSONModel {
    uuid: string;
    name: string;
    path: string;
    type: MinecraftVersionType;
    version: SemVersion;
    imported: boolean;
    installedFrom: string;

    constructor(uuid: string, name: string, path: string, type: MinecraftVersionType, version: SemVersion, imported: boolean, installedFrom: string) {
        this.uuid = uuid;
        this.name = name;
        this.path = path;
        this.type = type;
        this.version = version;
        this.imported = imported;
        this.installedFrom = installedFrom;
    }

    toString(): string {
        return `InstalledVersion with UUID: ${this.uuid}, name: ${this.name}, path: ${this.path}, type: ${this.type}, imported: ${this.imported}, installedFrom: ${this.installedFrom}`;
    }

    getName(): string {
        return this.name;
    }

    static fromObject(obj: any): InstalledVersionModel {
        if (!("uuid" in obj) || !("name" in obj) || !("path" in obj) || !("type" in obj) || !("version" in obj) || !("imported" in obj) || !("installed_from" in obj)) {
            throw new Error("Invalid installed version object");
        }

        return new InstalledVersionModel(
            obj.uuid,
            obj.name,
            obj.path,
            obj.type,
            SemVersion.fromString(obj.version),
            obj.imported,
            obj.installed_from
        );
    }

    static toObject(obj: InstalledVersionModel): any {
        return {
            uuid: obj.uuid,
            name: obj.name,
            path: obj.path,
            type: obj.type,
            version: obj.version.toString(),
            imported: obj.imported,
            installed_from: obj.installedFrom
        };
    }

    toObject(): any {
        return InstalledVersionModel.toObject(this);
    }

    static fromJSON(json: string): InstalledVersionModel {
        const obj = JSON.parse(json);
        return InstalledVersionModel.fromObject(obj);
    }

    toJSON(): string {
        return JSON.stringify(this.toObject(), undefined, 4);
    }
}

export type MinecraftGeneralVersionInfo = MinecraftVersionData | InstalledVersionModel;

export class InstalledVersionListModel implements IJSONModel {
    versions: InstalledVersionModel[];

    constructor(versions: InstalledVersionModel[]) {
        this.versions = versions;
    }

    toString(): string {
        return `InstalledVersionListModel with ${this.versions.length} versions: [\n${this.versions.map(v => `  ${v.toString()}`).join(",\n")}\n]`;
    }

    static fromObject(obj: any): InstalledVersionListModel {
        if (!("versions" in obj)) {
            throw new Error("Invalid version cache object");
        }

        return new InstalledVersionListModel(
            obj.versions.map((v: any) =>
                InstalledVersionModel.fromObject(v)
            )
        );
    }

    static toObject(obj: InstalledVersionListModel): any {
        return {
            versions: obj.versions.map(v => v.toObject())
        };
    }

    toObject(): any {
        return InstalledVersionListModel.toObject(this);
    }

    static fromJSON(json: string): InstalledVersionListModel {
        const obj = JSON.parse(json);
        return InstalledVersionListModel.fromObject(obj);
    }

    toJSON(): string {
        return JSON.stringify(this.toObject(), undefined, 4);
    }

    saveToFile(filePath: string) {
        PathUtils.ValidatePath(filePath);
        fs.writeFileSync(filePath, this.toJSON(), "utf-8");
    }

    reloadFromFile(filePath: string) {
        PathUtils.ValidatePath(filePath);
        const newData = InstalledVersionListModel.loadFromFile(filePath);
        this.versions = newData.versions;
    }

    static loadFromFile(filePath: string): InstalledVersionListModel {
        PathUtils.ValidatePath(filePath);
        if (!fs.existsSync(filePath)) {
            return new InstalledVersionListModel([]);
        }
        const json = fs.readFileSync(filePath, "utf-8");
        return InstalledVersionListModel.fromJSON(json);
    }

    static getDefaultFilePath(): string {
        const paths = getPaths();
        return path.join(paths.versionsPath, "installed_versions.json");
    }
}

type VersionManagerEventCallbacks = {
    version_installed: (version: InstalledVersionModel) => void;
    version_uninstalled: (uuid: string) => void;
    // adiciona mais eventos aqui com seus próprios tipos
}

type VersionManagerEvent = keyof VersionManagerEventCallbacks;

export class VersionManager {
    public readonly database: VersionDatabase = new VersionDatabase();
    private installedVersions: InstalledVersionListModel = new InstalledVersionListModel([]);
    private subscribers: { 
        [E in VersionManagerEvent]?: VersionManagerEventCallbacks[E][] 
    } = {};

    constructor() {}

    subscribe<E extends VersionManagerEvent>(event: E, callback: VersionManagerEventCallbacks[E]): () => void {
        if (!this.subscribers[event]) 
            this.subscribers[event] = [];
        this.subscribers[event]!.push(callback);
        return () => {
            this.unsubscribe(event, callback);
        };
    }

    unsubscribe<E extends VersionManagerEvent>(event: E, callback: VersionManagerEventCallbacks[E]) {
        if (!this.subscribers[event])
            return;
        this.subscribers[event] = this.subscribers[event]!.filter(cb => cb !== callback) as any;
    }

    private notify<E extends VersionManagerEvent>(event: E, ...args: Parameters<VersionManagerEventCallbacks[E]>) {
        this.subscribers[event]?.forEach(cb => (cb as (...a: any[]) => void)(...args));
    }

    isLocked(versionFileName: string): boolean {
        const paths = getPaths();
        const lockPath = path.join(paths.versionsPath, versionFileName);

        // Check if the version is currently locked, .lock files have the session UUID, 
        // so if the file exists but the session UUID is different, 
        // we can consider the lock as invalid and ignore it (probably from a previous launcher instance that didn't clean up properly), 
        // but if the session UUID matches, then we consider it as locked
        return FileLocker.get().isLocked(lockPath);
    }

    lockVersion(versionFileName: string) {
        const paths = getPaths();
        const lockPath = path.join(paths.versionsPath, versionFileName);
        if (this.isLocked(versionFileName))
            throw new Error(`Version ${versionFileName} is already locked!`);

        // Lock the version to prevent multiple work at the same time
        FileLocker.get().lockFile(lockPath);
    }

    unlockVersion(versionFileName: string) {
        const paths = getPaths();
        const lockPath = path.join(paths.versionsPath, versionFileName);

        // Unlock the version
        FileLocker.get().unlockFile(lockPath);
    }

    async downloadVersion(uuid: string): Promise<boolean> {
        const versionsPath = useAppStore.getState().platform.getPaths().versionsPath;
        PathUtils.ValidatePath(versionsPath);
        
        // Update the version database before downloading to ensure we have the latest information
        const result = await this.database.update();
        if (result instanceof Error) {
            throw result;
        }
        
        // Get the version information from the database, we need the URLs to download the version
        const version = this.database.getVersionByUUID(uuid);
        if (!version) {
            throw new Error(`Version with UUID: '${uuid}' not found in database!`);
        }

        // The version file name is in the format of "Minecraft-{version}.msixvc", for example "Minecraft-1.20.1.msixvc"
        const versionFileNameWithExt = `Minecraft-${version.version.toString()}.msixvc`;
        const versionFilePath = path.join(versionsPath, versionFileNameWithExt);

        // Before downloading, we want to check the mirrors for the version and select the fastest one to download from
        const getFastestMirror = async (mirrors: string[]): Promise<string> => {
            const start = performance.now();
            const timings: { mirror: string; time: number }[] = [];
            console.log("Testing mirrors for version download:", mirrors);
            console.log(`Starting at ${start} ms`);

            // We will send a HEAD request to each mirror to check if it's up and measure the response time, we won't download the actual file here, just check the headers
            for (const mirror of mirrors) {
                try {
                    const response = await fetch(mirror, { method: "HEAD" });
                    if (!response.ok) {
                        console.warn(`Mirror ${mirror} responded with status ${response.status}, skipping.`);
                        continue;
                    }
                    // If we got a valid response, we consider this mirror as a candidate and record the time it took to respond
                    const ms = performance.now() - start;
                    console.log(`Mirror ${mirror} responded in ${ms.toFixed(2)} ms`);
                    timings.push({ mirror, time: ms });
                }
                catch (e) {
                    console.warn(`Failed to fetch mirror ${mirror}:`, e);
                }
            }

            // If no mirrors responded successfully, we will default to the first mirror in the list, even though it might be down, just to give it a try and let the user see the error if it fails, rather than saying "no mirrors available" which might be confusing if the first mirror is actually up but just had a slow response time
            if (timings.length === 0) {
                console.warn("No mirrors responded, defaulting to first mirror.");
                console.log(`Defaulting to mirror ${mirrors[0]}`);
                return mirrors[0];
            }

            // Sort the mirrors by their response time and select the fastest one
            timings.sort((a, b) => a.time - b.time);
            console.log(`Fastest mirror is ${timings[0]?.mirror ?? mirrors[0]}`);
            console.log(`Mirror timings:`, timings);
            return timings[0]?.mirror ?? mirrors[0];
        }

        // Get the fastest mirror
        const mirror = await getFastestMirror(version.urls);
        const response = await fetch(mirror, { method: "HEAD" });
        if (!response.ok) {
            throw new Error(`Failed to fetch version from mirror ${mirror}, status: ${response.status}`);
        }

        // Check if the file already exists and has the correct size before downloading
        // Sadly the headers don't provide checksums for the files, otherwise we could verify the file integrity after download and avoid issues with corrupted downloads
        const expectedSize = parseInt(response.headers.get("content-length") ?? "0");
        if (isNaN(expectedSize) || expectedSize <= 0) {
            console.warn(`Invalid content-length from mirror ${mirror}: ${response.headers.get("content-length")}`);
        }

        // If the file already exists and has the correct size, we can skip the download
        if (fs.existsSync(versionFilePath) && expectedSize > 0 && fs.statSync(versionFilePath).size === expectedSize) {
            console.log(`File already exists and is up to date: ${versionFilePath}`);
            return true;
        }

        // Before we start downloading, we want to check if the version is currently being downloaded by another process
        if (this.isLocked(versionFileNameWithExt)) {
            throw new Error(`Version ${version.version.toString()} is currently being installed by another process. Please wait until it's finished.`);
        }

        // Lock the version to prevent multiple downloads at the same time, we will unlock it after the download is complete or if it fails
        this.lockVersion(versionFileNameWithExt);

        // Now we can start the download
        console.log(`Selected mirror for downloading version ${version.version.toString()}: ${mirror}`);
        console.log(`Starting download at ${performance.now()} ms`);
        const nowTime = new Date();
        await ProgressBar.useAsync(async ({ setStatus, setMessage, setProgress }) => {
            // Set the status to downloading and show the progress bar, we will update the progress in the Downloader.downloadFile callback
            setStatus("downloading");
            await Downloader.downloadFile(mirror, versionFilePath, (transferred, total) => {
                setMessage(`Downloading Minecraft ${version.version.toString()}... (${(transferred / (1024 * 1024)).toFixed(1)}MB / ${(total / (1024 * 1024)).toFixed(1)}MB)`);
                setProgress(total > 0 ? transferred / total : 0);
            }, success => {
                // Should probably return a error on this callback but meh
                if (!success) {
                    throw new Error("Failed to download Minecraft!");
                }
            });
        });

        // Unlock the version after the download is complete
        console.log(`Finished download at ${performance.now()} ms, total time: ${((new Date().getTime() - nowTime.getTime()) / 1000).toFixed(2)} seconds`);
        this.unlockVersion(versionFileNameWithExt);
        return true;
    }

    async extractVersionByUUID(uuid: string): Promise<boolean> {
        const versionsPath = useAppStore.getState().platform.getPaths().versionsPath;
        PathUtils.ValidatePath(versionsPath);

        // Get the version information from the database, we need the version number and type to determine the file paths and decryption parameters
        const version = this.database.getVersionByUUID(uuid);
        if (!version) {
            throw new Error(`Version with UUID: '${uuid}' not found in database!`);
        }

        const versionFileName = `Minecraft-${version.version.toString()}`;
        const versionFileNameWithExt = `Minecraft-${version.version.toString()}.msixvc`;
        const versionFilePath = path.join(versionsPath, versionFileNameWithExt);
        const extractedVersionPath = path.join(versionsPath, versionFileName);

        // Start the extraction process, this involves decrypting the MSIXVC file and then extracting it to the target folder
        return await this.extractVersionByPath(versionFilePath, extractedVersionPath, version.version, version.type);
    }

    async extractVersionByPath(
        versionFilePath: string, 
        targetOutputPath: string, 
        version: SemVersion, 
        type: MinecraftVersionType,
        shouldAskUpdate: boolean = true
    ): Promise<boolean> {
        const versionFileName = path.basename(versionFilePath);

        // Check if the version is already locked, if so something's wrong
        if (this.isLocked(versionFileName)) {
            throw new Error(`Version ${version.toString()} is currently being installed by another process. Please wait until it's finished.`);
        }

        // Lock the version to prevent multiple work at the same time
        this.lockVersion(versionFileName);
        
        // Perform decryption and extraction with progress updates
        await ProgressBar.useAsync(async ({ setStatus, setMessage, setProgress }) => {
            // Check XVDTool version and ask for update if needed before starting decryption and extraction
            await LauncherTools.XVDTool.check();

            // Show status for decryption
            setStatus("decrypting");
            setMessage(`Decrypting MSIXVC of Minecraft ${version.toString()}...`);
            setProgress(0.5);

            // Try all known CIK keys until one works (throws on failure)
            await LauncherTools.XVDTool.decryptFile(versionFilePath, CIK_KEYS, false);

            // Show status for extraction
            setStatus("extracting");
            setMessage(`Extracting Minecraft ${version.toString()}...`);
            setProgress(0);

            // XVDTool.extract will call the tool to perform extraction, it will return an error message if extraction fails, otherwise null
            // It will also update the progress bar internally by reading the tool's output, so we don't need to worry about that here
            const extractErr = await LauncherTools.XVDTool.extractFile(versionFilePath, targetOutputPath, false);
            if (extractErr) {
                throw new Error(`Failed to extract Minecraft! (${extractErr})`);
            }

            // If we reached this point, decryption and extraction were successful
        });

        // Unlock the version after decryption and extraction are complete
        this.unlockVersion(versionFileName);
        return true;
    }

    getInstalledVersions(): InstalledVersionModel[] {
        // Reload the installed versions from file to ensure we have the latest information
        this.installedVersions.reloadFromFile(path.join(getPaths().versionsPath, "installed_versions.json"));
        return this.installedVersions.versions;
    }

    getInstalledVersionByUUID(uuid: string): InstalledVersionModel | null {
        // Get the list of installed versions
        const versions = this.getInstalledVersions();

        // Find the installed version with the matching UUID
        const installedVersion = versions.find(v => v.uuid === uuid);
        if (!installedVersion)
            return null;

        // Check if the installed version's path is valid, 
        // if not we will remove it from the installed versions list and return null, 
        // this can happen if the user manually deletes the version folder
        if (!fs.existsSync(installedVersion.path) || !fs.statSync(installedVersion.path).isDirectory()) {
            console.warn(`Installed version with UUID ${uuid} has an invalid path: ${installedVersion.path}. Removing from installed versions list.`);
            const updatedVersions = versions.filter(v => v.uuid !== uuid);
            this.installedVersions.versions = updatedVersions;
            this.installedVersions.saveToFile(InstalledVersionListModel.getDefaultFilePath());
            return null;
        }

        return installedVersion;
    }

    async installVersion(version: VersionInstallationData): Promise<boolean> {
        // Before we start installing, we want to check if the version is already installed
        if (this.getInstalledVersionByUUID(version.uuid)) {
            throw new Error(`Version with UUID: '${version.uuid}' is already installed!`);
        }
        
        // For non-imported versions, we expect the versionOutputPath to be present and valid, 
        // for imported versions, we expect the versionFile to be present and valid
        if (version.kind === "downloaded") {
            // For downloaded versions, we will directly use the extracted version folder as the version path
            if (!fs.existsSync(version.path) || !fs.statSync(version.path).isDirectory()) {
                throw new Error("Invalid version output path!");
            }

            // Get the version information from the database, 
            // we need the version number and type to determine the name and other properties for the installed version record
            const dbVersion = this.database.getVersionByUUID(version.uuid);
            if (!dbVersion) {
                throw new Error(`Trying to install non-imported version with UUID: '${version.uuid}' but it was not found in the database!`);
            }

            // If we reached this point, we can consider the version as successfully installed
            const newInstalledVersion = new InstalledVersionModel(
                dbVersion.uuid,
                dbVersion.type === "release" ? `Minecraft ${dbVersion.version.toString()}` : `Minecraft ${dbVersion.version.toString()} (Preview)`,
                version.path,
                dbVersion.type,
                dbVersion.version,
                false,
                version.from
            );

            // Add the new installed version to the list and save it to file
            this.installedVersions.versions.push(newInstalledVersion);
            this.installedVersions.saveToFile(InstalledVersionListModel.getDefaultFilePath());
            this.notify("version_installed", newInstalledVersion);
            return true;
        }
        // For imported versions, we will copy the version file to the versions folder and then decrypt and/or extract it from there, 
        // this is to ensure that all version files are stored in a consistent location and we can manage them properly, 
        // we will also mark the installed version as imported and store the original file path for reference
        else {
            // Check if the version file path is valid, it must exist and be a file
            if (!fs.existsSync(version.file) || !fs.statSync(version.file).isFile()) {
                throw new Error("Invalid version file path!");
            }

            // Check if the version file has the correct extension, we only support .msixvc files for import,
            // I don't know .msixvc files MAGIC, so I have no way to verify if the file is actually a valid .msixvc file other than checking the extension,
            if (!version.file.toLowerCase().endsWith(".msixvc")) {
                throw new Error("Only .msixvc files are supported for import!");
            }

            // Copy the version file to the versions folder
            const copyTargetPath = MinecraftVersionData.buildVersionPath(false, version.version.toString(), version.type, version.uuid);
            const extractedVersionPath = copyTargetPath.replace(".msixvc", "");
            await ProgressBar.useAsync(async ({ setMessage, setProgress }) => {
                setMessage(`Copying ${version.file}...`);
                setProgress(0.5);
                await fs.promises.copyFile(version.file, copyTargetPath);
            }, true, FULL_PROGRESS_RESET_OPTIONS);

            // After copying the file, we will attempt to decrypt and/or extract it using the same process as for downloaded versions
            try {
                await this.extractVersionByPath(copyTargetPath, extractedVersionPath, version.version, version.type);
            } finally {
                await fs.promises.unlink(copyTargetPath);
            }

            // If we reached this point, we can consider the version as successfully installed
            const newInstalledVersion = new InstalledVersionModel(
                version.uuid,
                version.name,
                extractedVersionPath,
                version.type,
                version.version,
                true,
                copyTargetPath
            );

            // Add the new installed version to the list and save it to file
            this.installedVersions.versions.push(newInstalledVersion);
            this.installedVersions.saveToFile(InstalledVersionListModel.getDefaultFilePath());
            this.notify("version_installed", newInstalledVersion);
            return true;
        }

        // If we reached this point, it means the provided version installation data is invalid, 
        // we will throw an error, this should never happen if the function is used correctly, 
        // but it's good to have this check just in case
        throw new Error("Invalid version installation data! For imported versions, 'versionFile' must be a valid path to an .msixvc file. For non-imported versions, 'versionOutputPath' must be a valid path to the extracted version folder.");
    }

    async uninstallVersion(uuid: string): Promise<boolean> {
        // Get the installed version by UUID, if it doesn't exist we can't uninstall it
        const installedVersion = this.getInstalledVersionByUUID(uuid);
        if (!installedVersion) {
            throw new Error(`Version with UUID: '${uuid}' is not installed!`);
        }

        // Remove the version folder, we will also log a warning if the folder doesn't exist, but we will still proceed to remove the version from the installed versions list, since the end result is the same (the version is uninstalled)
        if (fs.existsSync(installedVersion.path) && fs.statSync(installedVersion.path).isDirectory()) {
            fs.rmSync(installedVersion.path, { recursive: true, force: true });
        } else {
            console.warn(`Trying to uninstall version with UUID: '${uuid}' but the version folder doesn't exist at path: ${installedVersion.path}`);
        }

        // Remove the version from the installed versions list and save it to file
        const updatedVersions = this.installedVersions.versions.filter(v => v.uuid !== uuid);
        this.installedVersions.versions = updatedVersions;
        this.installedVersions.saveToFile(InstalledVersionListModel.getDefaultFilePath());
        this.notify("version_uninstalled", uuid);
        return true;
    }

    async downloadExtractAndInstallVersion(uuid: string): Promise<boolean> {
        // Get the version information from the database
        const version = this.database.getVersionByUUID(uuid);
        if (!version) {
            throw new Error(`Version with UUID: '${uuid}' not found in database!`);
        }

        // Helper function to clean up any leftover files from the download and extraction process
        const cleanupVersionShenanigans = async (cleanMsixvc: boolean) => {
            const paths = getPaths();
            const msixvcPath = path.join(paths.versionsPath, `Minecraft-${version.version.toString()}.msixvc`);
            const lockPath = path.join(paths.versionsPath, `Minecraft-${version.version.toString()}.lock`);
            console.log("Cleaning up version shenanigans, removing files: ", msixvcPath, lockPath);
            if (cleanMsixvc)
                fs.rmSync(msixvcPath, { force: true });
            fs.rmSync(lockPath, { force: true });
        };

        // Before we start the download, we want to clean up any leftover files from previous download and extraction attempts for this version, 
        // this doesn't include the .msixvc file, since maybe it was downloaded successfully but the process failed during extraction, 
        // in that case we want to keep the .msixvc file to avoid having to download it again
        cleanupVersionShenanigans(false);
        
        // Now we can start the download, extraction and installation process for the version, 
        // we will perform these steps sequentially and if any of them fails, we will throw an error and stop the process, 
        // if all steps succeed, we will return true to indicate that the version was successfully downloaded, extracted and installed
        // (Btw, download can return true "instantly" if the file already exists and is valid)
        const downloadSuccess = await this.downloadVersion(uuid);
        if (!downloadSuccess) {
            throw new Error("Failed to download version!");
        }

        // After the version is downloaded, procees to decrypt and extract it, 
        // if this fails we will throw an error
        const extractSuccess = await this.extractVersionByUUID(uuid);
        if (!extractSuccess) {
            throw new Error("Failed to extract version!");
        }

        const versionFileName = `Minecraft-${version.version.toString()}`;
        const extractedVersionPath = path.join(getPaths().versionsPath, versionFileName);
        
        // After the version is extracted, we will proceed to install it,
        // we create the installation data for the version, 
        // this will be used to create the installed version record and save it to the installed versions list
        const installationData: DownloadedVersionInstallationData = {
            kind: "downloaded",
            uuid: version.uuid,
            name: version.type === "release" ? `Minecraft ${version.version.toString()}` : `Minecraft ${version.version.toString()} (Preview)`,
            version: version.version,
            type: version.type,
            from: path.join(getPaths().versionsPath, `${versionFileName}.msixvc`),
            path: extractedVersionPath
        };

        // Now we can proceed to install the version using the installation data we created,
        // if the installation fails, we will throw an error, if it succeeds
        const installSuccess = await this.installVersion(installationData);
        if (!installSuccess) {
            throw new Error("Failed to install version after download and extraction!");
        }
        
        // If we reached this point, it means the version was successfully downloaded, extracted and installed, 
        // we can return true to indicate success, but before that we want to clean up any leftover files from the process, 
        // this includes the .msixvc file and the .lock file, 
        // we will also log a message to indicate that the process was completed successfully
        console.log(`Version ${version.version.toString()} downloaded, extracted and installed successfully!`);
        await cleanupVersionShenanigans(true);
        return true;
    }
}