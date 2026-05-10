import { confirmAction } from "@renderer/popups/ConfirmPopup";
import { useAppStore } from "@renderer/states/AppStore";
import { Profile } from "./Profiles";
import { inspectRoamingState, resolveProfileDataPath, resolveRoamingPath } from "./ProfileDataLinker";
import { UnregisterCurrent } from "./AppRegistry";
import { InstalledVersionModel } from "./VersionManager";

const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");
const { shell } = window.require("electron") as typeof import("electron");

function getInstalledVersionForProfile(profile: Profile): InstalledVersionModel | null {
    const { versionManager } = useAppStore.getState();
    if (profile.version_uuid) {
        const byUuid = versionManager.getInstalledVersionByUUID(profile.version_uuid);
        if (byUuid) return byUuid;
    }
    if (profile.minecraft_version) {
        return versionManager.getInstalledVersions().find(v => v.version.toString() === profile.minecraft_version) ?? null;
    }
    return null;
}

/** Opens the profile's install folder (the installed Minecraft version files). */
export function openInstallFolder(profile: Profile): void {
    const installed = getInstalledVersionForProfile(profile);
    if (installed) {
        shell.openPath(installed.path);
        return;
    }
    useAppStore.getState().setError("No installed version folder found for this profile.");
}

/** Opens the profile's data folder (worlds, resource packs, settings). */
export function openDataFolder(profile: Profile): void {
    const dataDir = resolveProfileDataPath(profile);
    fs.mkdirSync(dataDir, { recursive: true });
    shell.openPath(dataDir);
}

/** Shows the "are you sure" popup. Resolves to true if the user confirmed deletion. */
export async function confirmProfileDeletion(profile: Profile): Promise<boolean> {
    return confirmAction({
        title: "Delete Profile?",
        message: `All data for "${profile.name}" will be permanently deleted, including worlds, resource packs, and settings. This cannot be undone.`,
        confirmText: "Delete Profile",
        cancelText: "Cancel",
    });
}

/**
 * Removes a profile's on-disk data (junction, ProfileData folder), unregisters
 * Minecraft if the active junction pointed at this profile, then removes the
 * profile from the saved list. Does NOT prompt the user — call
 * {@link confirmProfileDeletion} first.
 */
export async function finalizeProfileDeletion(profile: Profile): Promise<void> {
    const store = useAppStore.getState();
    const profileDataDir = resolveProfileDataPath(profile);

    let removedActiveJunction = false;
    for (const type of ["release", "preview"] as const) {
        const roaming = resolveRoamingPath(type);
        const state = inspectRoamingState(roaming);
        if (state.kind !== "junction") continue;
        const normalized = path.resolve(profileDataDir).toLowerCase();
        if (state.target.toLowerCase() === normalized) {
            try {
                fs.unlinkSync(roaming);
                removedActiveJunction = true;
            } catch (e) {
                console.error(`[ProfileActions] Failed to remove junction at ${roaming}:`, e);
            }
        }
    }

    if (removedActiveJunction) {
        try {
            await UnregisterCurrent();
        } catch (e) {
            console.warn("[ProfileActions] Failed to unregister Minecraft:", e);
        }
    }

    try {
        if (fs.existsSync(profileDataDir)) {
            fs.rmSync(profileDataDir, { recursive: true, force: true });
        }
    } catch (e) {
        console.error(`[ProfileActions] Failed to delete profile data folder ${profileDataDir}:`, e);
    }

    const newProfiles = store.allProfiles.filter(p => p.uuid !== profile.uuid);
    store.setAllProfiles(newProfiles);
    store.saveData();
    store.refreshAllMods();
}
