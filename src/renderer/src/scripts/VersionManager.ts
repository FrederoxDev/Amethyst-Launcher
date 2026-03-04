import React from "react";

import { Extractor } from "@renderer/scripts/backend/Extractor";
import { download, downloadGdk } from "@renderer/scripts/backend/MinecraftVersionDownloader";
import { SemVersion } from "@renderer/scripts/classes/SemVersion";
import { MinecraftVersion } from "@renderer/scripts/Versions";
import { UseAppState } from "@renderer/contexts/AppState";
import { PathUtils } from "./PathUtils";

const fs = window.require("fs");
const path = window.require("path");

function getPaths() {
    return UseAppState.getState().platform.getPaths();
}

// export function GetDefaultInstallPath(): string {
//     const paths = getPaths();
//     PathUtils.ValidatePath(paths.versionsPath);

//     if (fs.existsSync(paths.versionsFilePath)) {
//         const version_file_text = fs.readFileSync(paths.versionsFilePath, "utf-8");
//         const version_file_data: VersionsFileObject = VersionsFileObject.fromString(version_file_text);

//         return version_file_data.default_installation_path;
//     }
//     return paths.versionsPath;
// }

export function IsDownloaded(version: SemVersion) {
    const paths = getPaths();
    const version_path = path.join(paths.versionsPath, `Minecraft-${version.toString()}`);
    return fs.existsSync(version_path);
}

export function IsLocked(version: SemVersion) {
    const paths = getPaths();
    const lock_path = path.join(paths.versionsPath, `Minecraft-${version.toString()}.lock`);
    return fs.existsSync(lock_path);
}

export function CreateLock(version: SemVersion) {
    const paths = getPaths();
    const lock_path = path.join(paths.versionsPath, `Minecraft-${version.toString()}.lock`);

    PathUtils.ValidatePath(lock_path);

    const handle = fs.openSync(lock_path, "w");
    fs.close(handle);
}

export function CleanupInstall(version: SemVersion, successful: boolean) {
    const paths = getPaths();
    const appxPath = path.join(paths.versionsPath, `Minecraft-${version.toString()}.zip`);
    const lockPath = path.join(paths.versionsPath, `Minecraft-${version.toString()}.lock`);
    PathUtils.DeletePath(appxPath);
    PathUtils.DeletePath(lockPath);

    if (!successful) {
        const folderPath = path.join(paths.versionsPath, `Minecraft-${version.toString()}`);
        PathUtils.DeletePath(folderPath);
    }
}

export async function DownloadVersion(
    version: MinecraftVersion,
    setStatus: React.Dispatch<React.SetStateAction<string>>,
    setLoadingPercent: React.Dispatch<React.SetStateAction<number>>
) {
    const paths = getPaths();
    PathUtils.ValidatePath(paths.versionsPath);

    const toMB = (bytes: number) => {
        const mb = bytes / (1024 * 1024);
        return `${mb.toFixed(1)}MB`;
    };

    const onProgress = (transferred: number, totalSize: number) => {
        setStatus(`Downloading: ${toMB(transferred)} / ${toMB(totalSize)}`);
        setLoadingPercent(transferred / totalSize);
    };

    const onComplete = (success: boolean) => {
        if (!success) {
            setStatus("");
            throw new Error("Failed to download Minecraft!");
        }
        setStatus("Successfully downloaded Minecraft!");
    };

    // if (version.type === "uwp") {
    //     const outputFile = path.join(paths.versionsPath, `Minecraft-${version.version.toString()}.zip`);

    //     await download(version.uuid, "1", outputFile, onProgress, onComplete);
    //     return;
    // }

    const outputFile = path.join(paths.versionsPath, `Minecraft-${version.version.toString()}.msixvc`);

    await downloadGdk(version, outputFile, onProgress, onComplete);
}

export async function ExtractVersion(
    version: MinecraftVersion,
    setStatus: React.Dispatch<React.SetStateAction<string>>,
    setLoadingPercent: React.Dispatch<React.SetStateAction<number>>
) {
    const paths = getPaths();
    if (version.type === "gdk") return;
    const appxPath = path.join(paths.versionsPath, `Minecraft-${version.version.toString()}.zip`);
    const folderPath = path.join(paths.versionsPath, `Minecraft-${version.version.toString()}`);

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
        success => {
            if (!success) {
                throw new Error("There was an error while extracting the game!");
            }

            console.log("Finished extracting!");
            setStatus("Successfully extracted the downloaded version!");
        }
    );
}

export function InstallProxy(version: MinecraftVersion) {
    const paths = getPaths();
    console.log("Installing proxy for version", version.version.toString());
    const target_path = path.join(paths.versionsPath, `Minecraft-${version.version.toString()}`, "dxgi.dll");
    //const proxy_path = path.join(paths.electronAppPath, "build/public/proxy/dxgi.dll");

    //fs.copyFileSync(proxy_path, target_path);
}

export function IsRegistered(version: MinecraftVersion) {
    const fileName = `Minecraft-${version.version.toString()}`;
    return true//GetPackagePath() === `${VersionsFolder}\\${fileName}`;
}
