import {MinecraftVersion} from "../types/MinecraftVersion";
import {download} from "./MinecraftVersionDownloader";
import {Extractor} from "./Extractor";
import {SemVersion} from "../types/SemVersion";
// import { RegDwordValue, RegSzValue, putValue, putValueSync } from "regedit-rs";
const sudo = require('sudo-prompt');
const regedit = window.require("regedit-rs") as typeof import("regedit-rs");
const child = window.require("child_process") as typeof import("child_process");
const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");

const toMB = (bytes: number) => {
    let mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)}MB`;
};

export function getAmethystFolder() {
    //@ts-ignore
    const amethystFolder = path.join(window.env["AppData"], "Amethyst");

    if (!fs.existsSync(amethystFolder)) {
        fs.mkdirSync(amethystFolder, {recursive: true});
    }

    return amethystFolder;
}

export function getMinecraftFolder() {
    //@ts-ignore
    return window.env["LocalAppData"] + "\\Packages\\Microsoft.MinecraftUWP_8wekyb3d8bbwe";
}

async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function downloadVersion(
    version: MinecraftVersion,
    setStatus: React.Dispatch<React.SetStateAction<string>>,
    setLoadingPercent: React.Dispatch<React.SetStateAction<number>>,
) {
    const downloadFolder = getAmethystFolder() + "/versions";
    if (!fs.existsSync(downloadFolder)) {
        fs.mkdirSync(downloadFolder, {recursive: true});
    }

    const fileName = `Minecraft-${version.version.toString()}.zip`;

    await download(
        version.uuid,
        "1",
        `${downloadFolder}/${fileName}`,
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
    const downloadFolder = getAmethystFolder() + "/versions";
    const fileName = `Minecraft-${version.version.toString()}`;
    const exludes = [
        "AppxMetadata/CodeIntegrity.cat",
        "AppxMetadata",
        "AppxBlockMap.xml",
        "AppxSignature.p7x",
        "[Content_Types].xml",
    ];

    await Extractor.extractFile(
        `${downloadFolder}/${fileName}.zip`,
        `${downloadFolder}/${fileName}/`,
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
    const downloadFolder = getAmethystFolder() + "/versions";
    const fileName = `Minecraft-${version.version.toString()}`;

    //@ts-ignore
    const proxyDllPath = window.native.path.join(window.native.__dirname, "proxy", "dxgi.dll",);
    const targetDllPath = `${downloadFolder}/${fileName}/dxgi.dll`;

    fs.copyFileSync(proxyDllPath, targetDllPath);
}

export function getCurrentlyInstalledPackageID() {
    const regKey =
        "HKCU\\SOFTWARE\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppModel\\Repository\\Packages";
    const listed = regedit.listSync(regKey);
    if (!listed[regKey].exists) return undefined;

    const minecraftKey = listed[regKey].keys.find((key) =>
        key.startsWith("Microsoft.MinecraftUWP_")
    );
    if (minecraftKey === undefined) return undefined;

    const minecraftValues =
        regedit.listSync(
            `${regKey}\\${minecraftKey}`,
        )[`${regKey}\\${minecraftKey}`];
    if (!minecraftValues.exists) return undefined;

    const packageId = minecraftValues.values["PackageID"].value as string;
    return packageId;
}

export async function unregisterExisting() {
    const packageId = getCurrentlyInstalledPackageID();
    console.log("Currently installed packageId", packageId);
    if (packageId === undefined) return;

    const unregisterCmd =
        `powershell -ExecutionPolicy Bypass -Command "& { Remove-AppxPackage -Package "${packageId}" }"`;
    child.spawn(unregisterCmd, {shell: true});
    await sleep(6000);
}

export async function registerVersion(version: MinecraftVersion) {
    const currentPackageId = getCurrentlyInstalledPackageID();
    if (currentPackageId !== undefined) {
        throw new Error("There is still a version installed!");
    }

    const downloadFolder = getAmethystFolder() + "/versions";
    const fileName = `Minecraft-${version.version.toString()}`;

    const registerCmd =
        `powershell -ExecutionPolicy Bypass -Command "& { Add-AppxPackage -Path "${downloadFolder}/${fileName}/AppxManifest.xml" -Register }"`;
    child.spawn(registerCmd, {shell: true});
    await sleep(6000);
}

export function getInstalledMinecraftPackagePath(version: MinecraftVersion) {
    const regKey =
        "HKCU\\SOFTWARE\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppModel\\Repository\\Packages";
    const listed = regedit.listSync(regKey);
    if (!listed[regKey].exists) return undefined;

    const minecraftKey = listed[regKey].keys.find((key) =>
        key.startsWith("Microsoft.MinecraftUWP_")
    );
    if (minecraftKey === undefined) return undefined;

    const minecraftValues =
        regedit.listSync(
            `${regKey}\\${minecraftKey}`,
        )[`${regKey}\\${minecraftKey}`];
    if (!minecraftValues.exists) return undefined;

    return minecraftValues.values["PackageRootFolder"].value as string;
}

export function isDeveloperModeEnabled() {
    const regKey = "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock"
    const listed = regedit.listSync(regKey);

    if (!listed[regKey].exists) return false;

    if ("AllowDevelopmentWithoutDevLicense" in listed[regKey].values) {
        const value = listed[regKey].values["AllowDevelopmentWithoutDevLicense"].value;
        return value == 1;
    }

    return false;
}

export async function tryEnableDeveloperMode(): Promise<boolean> {
    const command = `reg add "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock" /v "AllowDevelopmentWithoutDevLicense" /t REG_DWORD /d 1 /f`;
    var options = {
        name: "Amethyst Launcher"
    };

    return new Promise((resolve, reject) => {
        try {
            sudo.exec(command, options, (error: any, stdout: any, stderr: any) => {
                if (error) {
                    console.log(`Error: ${error}`);
                    resolve(false);
                } else {
                    console.log(`stdout: ${stdout}`);
                    resolve(true);
                }
            });
        } catch (e) {
            console.log(e)
            resolve(false);
        }
    });
}


export function isRegisteredVersionOurs(version: MinecraftVersion) {
    const downloadFolder = getAmethystFolder() + "\\versions";
    const fileName = `Minecraft-${version.version.toString()}`;

    const packageRootFolder = getInstalledMinecraftPackagePath(version);
    if (packageRootFolder === undefined) return false;

    return packageRootFolder === `${downloadFolder}\\${fileName}`;
}

export function isVersionDownloaded(version: SemVersion) {
    const downloadFolder = getAmethystFolder() + "\\versions";
    const fileName = `Minecraft-${version.toString()}`;
    const folder = `${downloadFolder}\\${fileName}\\`;
    return fs.existsSync(folder);
}

export function isLockFilePresent(version: SemVersion) {
    const downloadFolder = getAmethystFolder() + "\\versions";
    const fileName = `Minecraft-${version.toString()}.lock`;
    const folder = `${downloadFolder}\\${fileName}`;
    console.log(folder)
    return fs.existsSync(folder);
}

export function createLockFile(version: SemVersion) {
    const downloadFolder = getAmethystFolder() + "\\versions";

    if (!fs.existsSync(downloadFolder)) {
        fs.mkdirSync(downloadFolder, {recursive: true})
    }

    const lockPath = `${downloadFolder}\\Minecraft-${version.toString()}.lock`
    const handle = fs.openSync(lockPath, "w");
    fs.close(handle);
}

export function cleanupSuccessfulInstall(version: SemVersion) {
    const downloadFolder = getAmethystFolder() + "\\versions";
    const appxPath = `${downloadFolder}\\Minecraft-${version.toString()}.zip`
    const lockPath = `${downloadFolder}\\Minecraft-${version.toString()}.lock`

    if (fs.existsSync(appxPath)) {
        fs.rmSync(appxPath, {recursive: true})
    }

    if (fs.existsSync(lockPath)) {
        fs.rmSync(lockPath, {recursive: true})
    }
}

export function cleanupFailedInstall(version: SemVersion) {
    const downloadFolder = getAmethystFolder() + "\\versions";
    const appxPath = `${downloadFolder}\\Minecraft-${version.toString()}.zip`
    const lockPath = `${downloadFolder}\\Minecraft-${version.toString()}.lock`
    const folderPath = `${downloadFolder}\\Minecraft-${version.toString()}\\`

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

export function cacheMinecraftData() {
    try {
        //@ts-ignore
        const minecraftDataFolder = window.env["LocalAppData"] +
            "\\Packages\\Microsoft.MinecraftUWP_8wekyb3d8bbwe";
        const tempDataFolder = getAmethystFolder() + "\\DataRestorePoint\\";

        // There is no data so do nothing
        if (!fs.existsSync(minecraftDataFolder)) return true;

        // Remove any existing stuff so if installing multiple times, they wont merge
        if (fs.existsSync(tempDataFolder)) {
            fs.rmdirSync(tempDataFolder, {recursive: true});
        }

        // Store contents of minecraft data in a temp folder
        fs.cpSync(minecraftDataFolder, tempDataFolder, {recursive: true});
    } catch (e: unknown) {
        const error = (e as Error);
        error.message = "[during cacheMinecraftData] " + error.message;
        throw error;
    }
}

export function restoreMinecraftData() {
    try {
        //@ts-ignore
        const minecraftDataFolder = window.env["LocalAppData"] +
            "\\Packages\\Microsoft.MinecraftUWP_8wekyb3d8bbwe";
        const tempDataFolder = getAmethystFolder() + "\\DataRestorePoint\\";

        // Check there was actually something to restore from
        if (!fs.existsSync(tempDataFolder)) return;

        if (fs.existsSync(minecraftDataFolder)) {
            fs.rmdirSync(minecraftDataFolder, {recursive: true});
        }

        fs.cpSync(tempDataFolder, minecraftDataFolder, {recursive: true});
    } catch (e: unknown) {
        const error = (e as Error);
        error.message = "[during restoreMinecraftData] " + error.message;
        throw error;
    }
}