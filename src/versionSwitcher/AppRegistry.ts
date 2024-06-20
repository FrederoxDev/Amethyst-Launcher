import { MinecraftVersion } from "../types/MinecraftVersion";
import { getVersionsFolder } from "./AmethystPaths";

const regedit = window.require("regedit-rs") as typeof import("regedit-rs");
const child = window.require("child_process") as typeof import("child_process");
const path = window.require("path") as typeof import("path");

async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getInstalledMinecraftPackagePath(version: MinecraftVersion) {
    const regKey = "HKCU\\SOFTWARE\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppModel\\Repository\\Packages";
    const listed = regedit.listSync(regKey);
    if (!listed[regKey].exists) return undefined;

    const minecraftKey = listed[regKey].keys.find((key) => key.startsWith("Microsoft.MinecraftUWP_"));
    if (minecraftKey === undefined) return undefined;

    const minecraftValues =
        regedit.listSync(
            `${regKey}\\${minecraftKey}`,
        )[`${regKey}\\${minecraftKey}`];
    if (!minecraftValues.exists) return undefined;

    return minecraftValues.values["PackageRootFolder"].value as string;
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

    const unregisterCmd = `powershell -ExecutionPolicy Bypass -Command "& { Remove-AppxPackage -Package "${packageId}" -PreserveApplicationData }"`;
    child.exec(unregisterCmd);
}

export async function registerVersion(version: MinecraftVersion) {
    let currentPackageId = getCurrentlyInstalledPackageID();
    let i = 0;

    while (true) {
        if (currentPackageId === undefined) break;
        await unregisterExisting();

        currentPackageId = getCurrentlyInstalledPackageID()
        await sleep(1000)
        console.log(`unregistering attempt ${i++}`)
    }

    if (currentPackageId !== undefined) {
        throw new Error("There is still a version installed!");
    }

    const versionsFolder = getVersionsFolder();
    const appxManifest = path.join(versionsFolder, `Minecraft-${version.version.toString()}`, "AppxManifest.xml");

    const registerCmd = `powershell -ExecutionPolicy Bypass -Command "& { Add-AppxPackage -Path "${appxManifest}" -Register }"`;
    child.exec(registerCmd);

    i = 0;
    // wait for it to finish registering
    while (true) {
        currentPackageId = getCurrentlyInstalledPackageID();
        if (currentPackageId !== undefined) return;
        await sleep(1000);
        console.log(`waiting for registration attempt ${i++}`)
    }
}