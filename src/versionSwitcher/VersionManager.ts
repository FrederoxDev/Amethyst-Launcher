import type { MinecraftVersion } from "../types/MinecraftVersion";
import { getInstalledMinecraftPackagePath } from "./AppRegistry";
import { download } from "./backend/MinecraftVersionDownloader";
import type { SemVersion } from "../types/SemVersion";
import type { Profile } from "../types/Profile";
import { Extractor } from "./backend/Extractor";

const path = window.require("path") as typeof import("path");
const fs = window.require("fs") as typeof import("fs");

export function isVersionDownloaded(version: SemVersion, profile: Profile) {
    return fs.existsSync(path.join(profile.path, `Minecraft-${version.toString()}`));
}

export function createLockFile(version: SemVersion, profile: Profile) {
    const lockPath = path.join(profile.path, `Minecraft-${version.toString()}.lock`);

    if (!fs.existsSync(profile.path)) {
        fs.mkdirSync(profile.path, { recursive: true });
    }

    const handle = fs.openSync(lockPath, "w");
    fs.close(handle);
}

export function isLockFilePresent(version: SemVersion, profile: Profile) {
    const lockPath = path.join(profile.path, `Minecraft-${version.toString()}.lock`);
    return fs.existsSync(lockPath);
}

export function cleanupSuccessfulInstall(version: SemVersion, profile: Profile) {
    const appxPath = path.join(profile.path, `Minecraft-${version.toString()}.zip`);
    const lockPath = path.join(profile.path, `Minecraft-${version.toString()}.lock`);

    if (fs.existsSync(appxPath)) {
        fs.rmSync(appxPath, { recursive: true });
    }

    if (fs.existsSync(lockPath)) {
        fs.rmSync(lockPath, { recursive: true });
    }
}

export function cleanupFailedInstall(version: SemVersion, profile: Profile) {
    const appxPath = path.join(profile.path, `Minecraft-${version.toString()}.zip`);
    const lockPath = path.join(profile.path, `Minecraft-${version.toString()}.lock`);
    const folderPath = path.join(profile.path, `Minecraft-${version.toString()}`);
    
    if (fs.existsSync(appxPath)) {
        fs.rmSync(appxPath, { recursive: true });
    }

    if (fs.existsSync(folderPath)) {
        fs.rmSync(folderPath, { recursive: true });
    }

    if (fs.existsSync(lockPath)) {
        fs.rmSync(lockPath, { recursive: true });
    }
}

export async function downloadVersion(
    version: MinecraftVersion,
    profile: Profile,
    setStatus: React.Dispatch<React.SetStateAction<string>>,
    setLoadingPercent: React.Dispatch<React.SetStateAction<number>>,
) {
    if (!fs.existsSync(profile.path)) {
        fs.mkdirSync(profile.path, { recursive: true });
    }

    const outputFile = path.join(profile.path, `Minecraft-${version.version.toString()}.zip`);

    const toMB = (bytes: number) => {
        let mb = bytes / (1024 * 1024);
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
    profile: Profile,
    setStatus: React.Dispatch<React.SetStateAction<string>>,
    setLoadingPercent: React.Dispatch<React.SetStateAction<number>>,
) {
    const appxPath = path.join(profile.path, `Minecraft-${version.toString()}.zip`);
    const folderPath = path.join(profile.path, `Minecraft-${version.toString()}`);

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

export function copyProxyToInstalledVer(version: MinecraftVersion, profile: Profile) {
    const directory = path.join(profile.path, `Minecraft-${version.toString()}`);

    //@ts-ignore
    const proxyDllPath = window.native.path.join(window.native.__dirname, "proxy", "dxgi.dll",);
    const targetDllPath = path.join(directory, "dxgi.dll")

    fs.copyFileSync(proxyDllPath, targetDllPath);
}

export function isRegisteredVersionOurs(version: MinecraftVersion, profile: Profile) {
    const fileName = `Minecraft-${version.version.toString()}`;

    const packageRootFolder = getInstalledMinecraftPackagePath(version);
    if (packageRootFolder === undefined) return false;

    return packageRootFolder === `${profile.path}\\${fileName}`;
}