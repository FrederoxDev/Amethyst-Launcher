import React from "react";

import { Extractor } from "@renderer/scripts/backend/Extractor";
import { downloadVersion } from "@renderer/scripts/backend/MinecraftVersionDownloader";
import { SemVersion } from "@renderer/scripts/classes/SemVersion";
import { MinecraftVersion, MinecraftVersionType } from "@renderer/scripts/Versions";
import { UseAppState } from "@renderer/contexts/AppState";
import { PathUtils } from "./PathUtils";
import { XVDTool } from "./backend/tools/XVDTool";
import { CIK_DATA_PREVIEW_GDK, CIK_DATA_RELEASE_GDK, CIK_UUID_PREVIEW_GDK, CIK_UUID_RELEASE_GDK } from "./backend/Decryption";

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
    version: MinecraftVersion
) {
    const setStatus = UseAppState.getState().setStatus;
    const paths = getPaths();
    PathUtils.ValidatePath(paths.versionsPath);

    const toMB = (bytes: number) => {
        const mb = bytes / (1024 * 1024);
        return `${mb.toFixed(1)}MB`;
    };

    const onProgress = (transferred: number, totalSize: number) => {
        setStatus(prev => ({ ...prev,
            type: "downloading",
            taskName: `Downloading Minecraft ${version.version.toString()}... (${toMB(transferred)} / ${toMB(totalSize)})`,
            showLoading: true,
            canCancel: false,
            progress: totalSize > 0 ? transferred / totalSize : null
        }));
    };

    const onComplete = (success: boolean) => {
        if (!success) {
            setStatus(prev => ({ ...prev,
                type: "idle",
                taskName: null,
                showLoading: false,
                canCancel: false,
                progress: null,
                errorMsg: "Failed to download Minecraft!"
            }));
            throw new Error("Failed to download Minecraft!");
        }
        setStatus(prev => ({ ...prev,
            type: "idle",
            taskName: "Downloaded minecraft successfully.",
            showLoading: false,
            canCancel: false,
            progress: null,
            errorMsg: null
        }));
    };

    const outputFile = path.join(paths.versionsPath, `Minecraft-${version.version.toString()}.msixvc`);
    await downloadVersion(version, outputFile, onProgress, onComplete);
}

export async function ExtractVersion(
    version: MinecraftVersion
): Promise<boolean> {
    const setStatus = UseAppState.getState().setStatus;
    const paths = getPaths();
    const msixvcPath = path.join(paths.versionsPath, `Minecraft-${version.version.toString()}.msixvc`);
    const folderPath = path.join(paths.versionsPath, `Minecraft-${version.version.toString()}`);
    const cikUuid = version.versionType === MinecraftVersionType.GdkPreview ? CIK_UUID_PREVIEW_GDK : CIK_UUID_RELEASE_GDK;
    const cikData = version.versionType === MinecraftVersionType.GdkPreview ? CIK_DATA_PREVIEW_GDK : CIK_DATA_RELEASE_GDK;
    
    setStatus(prev => ({ ...prev,
        type: "decrypting",
        taskName: `Decrypting MSIXVC of Minecraft ${version.version.toString()}...`,
        showLoading: true,
        canCancel: false,
        progress: 0.5,
        errorMsg: null
    }));
    
    const decryptErr = await XVDTool.decrypt(msixvcPath, cikUuid, cikData);
    if (decryptErr) {
        setStatus(prev => ({ ...prev,
            type: "idle",
            taskName: null,
            showLoading: false,
            canCancel: false,
            progress: null,
            errorMsg: `Failed to decrypt MSIXVC! (${decryptErr})`
        }));
        return false;
    }

    setStatus(prev => ({ ...prev,
        type: "extracting",
        taskName: `Extracting Minecraft ${version.version.toString()}...`,
        showLoading: true,
        canCancel: false,
        progress: null,
        errorMsg: null
    }));

    const extractErr = await XVDTool.extract(msixvcPath, folderPath);
    if (extractErr) {
        setStatus(prev => ({ ...prev,
            type: "idle",
            taskName: null,
            showLoading: false,
            canCancel: false,
            progress: null,
            errorMsg: `Failed to extract Minecraft! (${extractErr})`
        }));
        return false;
    }

    setStatus(prev => ({ ...prev,
        type: "idle",
        taskName: `Minecraft ${version.version.toString()} is ready!`,
        showLoading: false,
        canCancel: false,
        progress: null,
        errorMsg: null
    }));
    return true;
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
