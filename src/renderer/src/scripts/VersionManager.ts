import { downloadVersion } from "@renderer/scripts/backend/MinecraftVersionDownloader";
import { SemVersion } from "@renderer/scripts/classes/SemVersion";
import { MinecraftVersionData, VersionDatabase } from "@renderer/scripts/VersionDatabase";
import { UseAppState } from "@renderer/contexts/AppState";
import { PathUtils } from "./PathUtils";
import { XVDTool } from "./backend/tools/XVDTool";
import { CIK_DATA_PREVIEW_GDK, CIK_DATA_RELEASE_GDK, CIK_UUID_PREVIEW_GDK, CIK_UUID_RELEASE_GDK } from "./backend/Decryption";
import { Downloader } from "./backend/Downloader";
import { is } from "@electron-toolkit/utils";

const fs = window.require("fs");
const path = window.require("path");

export class VersionManager {
    public readonly database: VersionDatabase = new VersionDatabase();

    constructor() {}

    isLocked(version: SemVersion): boolean {
        const paths = getPaths();
        const lockPath = path.join(paths.versionsPath, `Minecraft-${version.toString()}.lock`);
        return fs.existsSync(lockPath);
    }

    lockVersion(version: SemVersion) {
        const paths = getPaths();
        const lockPath = path.join(paths.versionsPath, `Minecraft-${version.toString()}.lock`);
        
        PathUtils.ValidatePath(lockPath);
        const handle = fs.openSync(lockPath, "w");
        fs.close(handle);
    }

    unlockVersion(version: SemVersion) {
        const paths = getPaths();
        const lockPath = path.join(paths.versionsPath, `Minecraft-${version.toString()}.lock`);
        fs.rmSync(lockPath, { force: true });
    }

    async downloadVersion(uuid: string): Promise<boolean> {
        const setStatus = UseAppState.getState().setStatus;
        const versionsPath = UseAppState.getState().platform.getPaths().versionsPath;
        PathUtils.ValidatePath(versionsPath);
        
        const result = await this.database.update();
        if (result instanceof Error) {
            throw result;
        }
        
        const version = this.database.getVersionByUUID(uuid);
        if (!version) {
            throw new Error(`Version with UUID: '${uuid}' not found in database!`);
        }

        const targetFilePath = path.join(versionsPath, `Minecraft-${version.version.toString()}.msixvc`);
        const getFastestMirror = async (mirrors: string[]): Promise<string> => {
            const start = performance.now();
            const timings: { mirror: string; time: number }[] = [];
            console.log("Testing mirrors for version download:", mirrors);
            console.log(`Starting at ${start} ms`);
            for (const mirror of mirrors) {
                try {
                    const response = await fetch(mirror, { method: "HEAD" });
                    if (!response.ok) {
                        console.warn(`Mirror ${mirror} responded with status ${response.status}, skipping.`);
                        continue;
                    }
                    const ms = performance.now() - start;
                    console.log(`Mirror ${mirror} responded in ${ms.toFixed(2)} ms`);
                    timings.push({ mirror, time: ms });
                }
                catch (e) {
                    console.warn(`Failed to fetch mirror ${mirror}:`, e);
                }
            }

            if (timings.length === 0) {
                console.warn("No mirrors responded, defaulting to first mirror.");
                console.log(`Defaulting to mirror ${mirrors[0]}`);
                return mirrors[0];
            }

            timings.sort((a, b) => a.time - b.time);
            console.log(`Fastest mirror is ${timings[0]?.mirror ?? mirrors[0]}`);
            console.log(`Mirror timings:`, timings);
            return timings[0]?.mirror ?? mirrors[0];
        }

        const mirror = await getFastestMirror(version.urls);
        const response = await fetch(mirror, { method: "HEAD" });
        if (!response.ok) {
            throw new Error(`Failed to fetch version from mirror ${mirror}, status: ${response.status}`);
        }
        const expectedSize = parseInt(response.headers.get("content-length") ?? "0");
        if (isNaN(expectedSize) || expectedSize <= 0) {
            console.warn(`Invalid content-length from mirror ${mirror}: ${response.headers.get("content-length")}`);
        }

        if (fs.existsSync(targetFilePath) && expectedSize > 0 && fs.statSync(targetFilePath).size === expectedSize) {
            console.log(`File already exists and is up to date: ${targetFilePath}`);
            return true;
        }

        console.log(`Selected mirror for downloading version ${version.version.toString()}: ${mirror}`);
        console.log(`Starting download at ${performance.now()} ms`);
        const nowTime = new Date();
        await Downloader.downloadFile(mirror, targetFilePath, (transferred, total) => {
            setStatus(prev => ({ ...prev,
                type: "downloading",
                taskName: `Downloading Minecraft ${version.version.toString()}... (${(transferred / (1024 * 1024)).toFixed(1)}MB / ${(total / (1024 * 1024)).toFixed(1)}MB)`,
                showLoading: true,
                canCancel: false,
                progress: total > 0 ? transferred / total : null
            }));
        }, success => {
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
                taskName: "Downloaded Minecraft successfully.",
                showLoading: false,
                canCancel: false,
                progress: null,
                errorMsg: null
            }));
        });
        console.log(`Finished download at ${performance.now()} ms, total time: ${((new Date().getTime() - nowTime.getTime()) / 1000).toFixed(2)} seconds`);
        return true;
    }

    async extractVersion(uuid: string): Promise<boolean> {
        const setStatus = UseAppState.getState().setStatus;
        const versionsPath = UseAppState.getState().platform.getPaths().versionsPath;
        PathUtils.ValidatePath(versionsPath);

        const version = this.database.getVersionByUUID(uuid);
        if (!version) {
            throw new Error(`Version with UUID: '${uuid}' not found in database!`);
        }

        const msixvcPath = path.join(versionsPath, `Minecraft-${version.version.toString()}.msixvc`);
        const folderPath = path.join(versionsPath, `Minecraft-${version.version.toString()}`);
        const cikUuid = version.type === "release" ? CIK_UUID_PREVIEW_GDK : CIK_UUID_RELEASE_GDK;
        const cikData = version.type === "preview" ? CIK_DATA_PREVIEW_GDK : CIK_DATA_RELEASE_GDK;
        
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
}

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

// export function IsDownloaded(version: SemVersion) {
//     const paths = getPaths();
//     const version_path = path.join(paths.versionsPath, `Minecraft-${version.toString()}`);
//     return fs.existsSync(version_path);
// }

// export function IsLocked(version: SemVersion) {
//     const paths = getPaths();
//     const lock_path = path.join(paths.versionsPath, `Minecraft-${version.toString()}.lock`);
//     return fs.existsSync(lock_path);
// }

// export function CreateLock(version: SemVersion) {
//     const paths = getPaths();
//     const lock_path = path.join(paths.versionsPath, `Minecraft-${version.toString()}.lock`);

//     PathUtils.ValidatePath(lock_path);

//     const handle = fs.openSync(lock_path, "w");
//     fs.close(handle);
// }

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

export function InstallProxy(version: MinecraftVersionData) {
    const paths = getPaths();
    console.log("Installing proxy for version", version.version.toString());
    const target_path = path.join(paths.versionsPath, `Minecraft-${version.version.toString()}`, "dxgi.dll");
    //const proxy_path = path.join(paths.electronAppPath, "build/public/proxy/dxgi.dll");

    //fs.copyFileSync(proxy_path, target_path);
}