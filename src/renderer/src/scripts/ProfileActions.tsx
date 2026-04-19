import { MinecraftButton, GRAY_MINECRAFT_BUTTON } from "@renderer/components/MinecraftButton";
import { PopupPanel } from "@renderer/components/PopupPanel";
import { Popup } from "@renderer/states/PopupStore";
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
    return Popup.useAsync<boolean>(({ submit }) => (
        <PopupPanel onExit={() => submit(false)}>
            <div className="version-picker" style={{ width: 380 }} onClick={e => e.stopPropagation()}>
                <div className="version-picker-header">
                    <p className="minecraft-seven" style={{ fontSize: "16px" }}>Delete Profile?</p>
                    <div className="version-popup-close" onClick={() => submit(false)}>
                        <svg width="20" height="20" viewBox="0 0 12 12">
                            <polygon className="fill-[#FFFFFF]" fillRule="evenodd"
                                points="12 1.01818182 10.9818182 0 6 4.98181818 1.01818182 0 0 1.01818182 4.98181818 6 0 10.9818182 1.01818182 12 6 7.01818182 10.9818182 12 12 10.9818182 7.01818182 6" />
                        </svg>
                    </div>
                </div>
                <div className="version-picker-divider" />
                <div style={{ padding: "12px 16px" }}>
                    <p className="minecraft-seven" style={{ fontSize: "12px", lineHeight: 1.5 }}>
                        All data for "{profile.name}" will be permanently deleted, including worlds, resource packs, and settings. This cannot be undone.
                    </p>
                </div>
                <div className="version-picker-divider" />
                <div className="version-picker-footer" style={{ justifyContent: "flex-start", gap: 8 }}>
                    <MinecraftButton text="Delete Profile" style={{ "--mc-button-container-h": "32px", "--mc-button-container-w": "160px" }} onClick={() => submit(true)} />
                    <MinecraftButton text="Cancel" colorPallete={GRAY_MINECRAFT_BUTTON} style={{ "--mc-button-container-h": "32px", "--mc-button-container-w": "120px" }} onClick={() => submit(false)} />
                </div>
            </div>
        </PopupPanel>
    ));
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
