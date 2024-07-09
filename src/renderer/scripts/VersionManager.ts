import { ipcRenderer } from "electron";
import { SemVersion } from "./classes/SemVersion";
import { VersionsFolder, ValidatePath, DeletePath } from "./Paths";
import { GetPackagePath } from "./AppRegistry";
import { Extractor } from "./backend/Extractor";
import { download } from "./backend/MinecraftVersionDownloader";
import {MinecraftVersion} from "./Versions";
import React from "react";

const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");

export function IsDownloaded(version: SemVersion) {
    return fs.existsSync(path.join(VersionsFolder, `Minecraft-${version.toString()}`));
}

export function IsLocked(version: SemVersion) {
    const lock_path = path.join(VersionsFolder, `Minecraft-${version.toString()}.lock`);
    return fs.existsSync(lock_path);
}

export function CreateLock(version: SemVersion) {
    const lock_path = path.join(VersionsFolder, `Minecraft-${version.toString()}.lock`);

    ValidatePath(lock_path);

    const handle = fs.openSync(lock_path, "w");
    fs.close(handle);
}

export function CleanupInstall(version: SemVersion, successful: boolean) {
    const appxPath = path.join(VersionsFolder, `Minecraft-${version.toString()}.zip`);
    const lockPath = path.join(VersionsFolder, `Minecraft-${version.toString()}.lock`);
    DeletePath(appxPath)
    DeletePath(lockPath)

    if (!successful) {
        const folderPath = path.join(VersionsFolder, `Minecraft-${version.toString()}`);
        DeletePath(folderPath)
    }
}

export async function DownloadVersion(version: MinecraftVersion, setStatus: React.Dispatch<React.SetStateAction<string>>, setLoadingPercent: React.Dispatch<React.SetStateAction<number>>) {
    ValidatePath(VersionsFolder)

    const outputFile = path.join(VersionsFolder, `Minecraft-${version.version.toString()}.zip`);

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

export async function ExtractVersion(version: MinecraftVersion, setStatus: React.Dispatch<React.SetStateAction<string>>, setLoadingPercent: React.Dispatch<React.SetStateAction<number>>) {
    const appxPath = path.join(VersionsFolder, `Minecraft-${version.version.toString()}.zip`);
    const folderPath = path.join(VersionsFolder, `Minecraft-${version.version.toString()}`);

    const excludes = [
        "AppxMetadata/CodeIntegrity.cat",
        "AppxMetadata",
        "AppxBlockMap.xml",
        "AppxSignature.p7x",
        "[Content_Types].xml",
    ];

    await Extractor.extractFile(
        appxPath,
        folderPath,
        excludes,
        (fileIndex, totalFiles, fileName) => {
            setLoadingPercent(fileIndex / totalFiles);
            setStatus(`Extracting: ${fileName}`);
        },
        (success) => {
            if (!success) {
                throw new Error("There was an error while extracting the game!");
            }

            console.log("Finished extracting!");
            setStatus("Successfully extracted the downloaded version!");
        },
    );
}

export function TransferProxy(version: MinecraftVersion) {
    const versionFolder = path.join(VersionsFolder, `Minecraft-${version.version.toString()}`);

    ipcRenderer.invoke('get-app-path').then(appPath => {
        const proxyDllPath = path.join(appPath, "build/public/proxy/dxgi.dll",);
        const targetDllPath = path.join(versionFolder, "dxgi.dll")

        fs.copyFileSync(proxyDllPath, targetDllPath);
    })
}

export function isRegisteredVersionOurs(version: MinecraftVersion) {
    const fileName = `Minecraft-${version.version.toString()}`;

    const packageRootFolder = GetPackagePath();
    if (packageRootFolder === undefined) return false;

    return packageRootFolder === `${VersionsFolder}\\${fileName}`;
}