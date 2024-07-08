import { ipcRenderer } from "electron";
import { MinecraftVersion } from "../types/MinecraftVersion";
import { SemVersion } from "../types/SemVersion";
import { /** getAmethystFolder, */ getVersionsFolder } from "./AmethystPaths";
import { getInstalledMinecraftPackagePath } from "./AppRegistry";
import { Extractor } from "./backend/Extractor";
import { download } from "./backend/MinecraftVersionDownloader";

const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");

export function isVersionDownloaded(version: SemVersion) {
    return fs.existsSync(path.join(getVersionsFolder(), `Minecraft-${version.toString()}`));
}

export function createLockFile(version: SemVersion) {
    const versionsFolder = getVersionsFolder();
    const lockPath = path.join(versionsFolder, `Minecraft-${version.toString()}.lock`);

    if (!fs.existsSync(versionsFolder)) {
        fs.mkdirSync(versionsFolder, {recursive: true})
    }

    const handle = fs.openSync(lockPath, "w");
    fs.close(handle);
}

export function isLockFilePresent(version: SemVersion) {
    const versionsFolder = getVersionsFolder();
    const lockPath = path.join(versionsFolder, `Minecraft-${version.toString()}.lock`);
    return fs.existsSync(lockPath);
}

export function cleanupSuccessfulInstall(version: SemVersion) {
    const versionsFolder = getVersionsFolder();
    const appxPath = path.join(versionsFolder, `Minecraft-${version.toString()}.zip`);
    const lockPath = path.join(versionsFolder, `Minecraft-${version.toString()}.lock`);

    if (fs.existsSync(appxPath)) {
        fs.rmSync(appxPath, {recursive: true})
    }

    if (fs.existsSync(lockPath)) {
        fs.rmSync(lockPath, {recursive: true})
    }
}

export function cleanupFailedInstall(version: SemVersion) {
    const versionsFolder = getVersionsFolder();
    const appxPath = path.join(versionsFolder, `Minecraft-${version.toString()}.zip`);
    const lockPath = path.join(versionsFolder, `Minecraft-${version.toString()}.lock`);
    const folderPath = path.join(versionsFolder, `Minecraft-${version.toString()}`);
    
    if (fs.existsSync(appxPath)) {
        fs.rmSync(appxPath, {recursive: true})
    }

    if (fs.existsSync(folderPath)) {
        fs.rmSync(folderPath, {recursive: true})
    }

    if (fs.existsSync(lockPath)) {
        fs.rmSync(lockPath, {recursive: true})
    }
}

export async function downloadVersion(
    version: MinecraftVersion,
    setStatus: React.Dispatch<React.SetStateAction<string>>,
    setLoadingPercent: React.Dispatch<React.SetStateAction<number>>,
) {
    const versionsFolder = getVersionsFolder();
    if (!fs.existsSync(versionsFolder)) {
        fs.mkdirSync(versionsFolder, {recursive: true});
    }

    const outputFile = path.join(versionsFolder, `Minecraft-${version.version.toString()}.zip`);

    const toMB = (bytes: number) => {
        const mb = bytes / (1024 * 1024);
        return `${mb.toFixed(1)}MB`;
    };

    await download(
        version.uuid,
        "1",
        outputFile,
        (transferred, totalSize) => {
            setStatus(`Downloading: ${toMB(transferred)} / ${toMB(totalSize)}`);
            setLoadingPercent(transferred / totalSize);
        },
        (success) => {
            if (!success) {
                setStatus("");
                throw new Error("Failed to download Minecraft!");
            }

            setStatus("Successfully downloaded Minecraft!");
        },
    );
}

export async function extractVersion(
    version: MinecraftVersion,
    setStatus: React.Dispatch<React.SetStateAction<string>>,
    setLoadingPercent: React.Dispatch<React.SetStateAction<number>>,
) {
    const versionsFolder = getVersionsFolder();
    const appxPath = path.join(versionsFolder, `Minecraft-${version.toString()}.zip`);
    const folderPath = path.join(versionsFolder, `Minecraft-${version.toString()}`);

    const exludes = [
        "AppxMetadata/CodeIntegrity.cat",
        "AppxMetadata",
        "AppxBlockMap.xml",
        "AppxSignature.p7x",
        "[Content_Types].xml",
    ];

    await Extractor.extractFile(
        appxPath,
        folderPath,
        exludes,
        (fileIndex, totalFiles, fileName) => {
            setLoadingPercent(fileIndex / totalFiles);
            setStatus(`Unzipping: ${fileName}`);
        },
        (success) => {
            if (!success) {
                throw new Error("There was an error while unzipping the game!");
            }

            console.log("Finished extracting!");
            setStatus("Successfully unextracted the downloaded version!");
        },
    );
}

export function copyProxyToInstalledVer(version: MinecraftVersion) {
    const versionsFolder = getVersionsFolder();
    const versionFolder = path.join(versionsFolder, `Minecraft-${version.toString()}`);

    ipcRenderer.invoke('get-app-path').then(appPath => {
        const proxyDllPath = path.join(appPath, "build/proxy/dxgi.dll",);
        const targetDllPath = path.join(versionFolder, "dxgi.dll")

        fs.copyFileSync(proxyDllPath, targetDllPath);
    })
}

export function isRegisteredVersionOurs(version: MinecraftVersion) {
    const versionsFolder = getVersionsFolder();
    const fileName = `Minecraft-${version.version.toString()}`;

    const packageRootFolder = getInstalledMinecraftPackagePath(version);
    if (packageRootFolder === undefined) return false;

    return packageRootFolder === `${versionsFolder}\\${fileName}`;
}