import { confirmAction } from "@renderer/popups/ConfirmPopup";
import { Profile } from "@renderer/scripts/domain/Profile";
import { InstalledVersion } from "@renderer/scripts/versions/InstalledVersion";
import { useAppStore } from "@renderer/states/AppStore";
import { FULL_PROGRESS_RESET_OPTIONS, ProgressBar } from "@renderer/states/ProgressBarStore";

const fs = window.require("fs") as typeof import("fs");
const { shell } = window.require("electron") as typeof import("electron");

export function installedVersionFor(profile: Profile): InstalledVersion | null {
    return useAppStore.getState().installedVersions.find(v => v.uuid === profile.versionUuid) ?? null;
}

export function displayVersion(profile: Profile): string {
    return installedVersionFor(profile)?.label || profile.versionLabel || "No version";
}

export function openInstallFolder(profile: Profile): void {
    const installed = installedVersionFor(profile);
    if (!installed) {
        useAppStore.getState().setError("That profile's Minecraft version isn't installed yet.");
        return;
    }
    shell.openPath(installed.path);
}

export function openDataFolder(profile: Profile): void {
    const dir = useAppStore.getState().platform.profileDataDir(profile.uuid);
    fs.mkdirSync(dir, { recursive: true });
    shell.openPath(dir);
}

export async function confirmProfileDeletion(profile: Profile): Promise<boolean> {
    return confirmAction({
        title: "Delete Profile?",
        message: `Everything for "${profile.name}" is deleted permanently, including worlds, resource packs and settings. This cannot be undone.`,
        confirmText: "Delete Profile",
        cancelText: "Cancel",
    });
}

export async function deleteProfile(profile: Profile): Promise<void> {
    const store = useAppStore.getState();

    await ProgressBar.useAsync(async ({ setStatus, setMessage }) => {
        setStatus("deleting");
        setMessage(`Deleting "${profile.name}"...`);

        await store.platform.discardProfileData(profile.uuid);

        store.setProfiles(store.profiles.filter(p => p.uuid !== profile.uuid));
        if (store.lastLaunchedProfileUuid === profile.uuid) store.setLastLaunchedProfileUuid(null);
        store.saveData();
        store.refreshAllMods();
    }, true, FULL_PROGRESS_RESET_OPTIONS);
}
