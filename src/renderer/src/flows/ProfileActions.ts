import { describeError } from "@shared/diagnostics/Log";
import { confirmAction } from "@renderer/popups/ConfirmPopup";
import { Profile } from "@renderer/scripts/domain/Profile";
import { log } from "@renderer/scripts/LauncherLog";
import { InstalledVersion } from "@renderer/scripts/versions/InstalledVersion";
import { useAppStore } from "@renderer/states/AppStore";
import { FULL_PROGRESS_RESET_OPTIONS, ProgressBar } from "@renderer/states/ProgressBarStore";

const fs = window.require("fs") as typeof import("fs");
const { shell } = window.require("electron") as typeof import("electron");

/** shell.openPath resolves to "" on success and an error string otherwise, never rejecting. */
function reportOpen(what: string, target: string): void {
    shell.openPath(target)
        .then(error => log("Profiles", error
            ? `Could not open ${what} ${target}: ${error}`
            : `Opened ${what} ${target}`))
        .catch(e => log("Profiles", `Could not open ${what} ${target}: ${describeError(e)}`));
}

export function installedVersionFor(profile: Profile): InstalledVersion | null {
    return useAppStore.getState().installedVersions.find(v => v.uuid === profile.versionUuid) ?? null;
}

export function displayVersion(profile: Profile): string {
    return installedVersionFor(profile)?.label || profile.versionLabel || "No version";
}

export function openInstallFolder(profile: Profile): void {
    const installed = installedVersionFor(profile);
    if (!installed) {
        log(
            "Profiles",
            `Cannot open the install folder for "${profile.name}": version ${profile.versionUuid || "unset"} `
            + `is not among the ${useAppStore.getState().installedVersions.length} installed versions`
        );
        useAppStore.getState().setError("That profile's Minecraft version isn't installed yet.");
        return;
    }
    reportOpen("the install folder", installed.path);
}

export function openDataFolder(profile: Profile): void {
    const dir = useAppStore.getState().platform.profileDataDir(profile.uuid);
    fs.mkdirSync(dir, { recursive: true });
    reportOpen(`the data folder for "${profile.name}"`, dir);
}

export async function confirmProfileDeletion(profile: Profile): Promise<boolean> {
    const confirmed = await confirmAction({
        title: "Delete Profile?",
        message: `Everything for "${profile.name}" is deleted permanently, including worlds, resource packs and settings. This cannot be undone.`,
        confirmText: "Delete Profile",
        cancelText: "Cancel",
    });
    log("Profiles", `Deletion of "${profile.name}" (${profile.uuid}) ${confirmed ? "confirmed" : "cancelled"} by the user`);
    return confirmed;
}

export async function deleteProfile(profile: Profile): Promise<void> {
    const store = useAppStore.getState();
    const dataDir = store.platform.profileDataDir(profile.uuid);
    log(
        "Profiles",
        `Deleting "${profile.name}" (${profile.uuid}) and its data at ${dataDir}; `
        + `it held mods [${profile.mods.join(", ") || "none"}]`
    );

    await ProgressBar.runAsync(async ({ setStatus, setMessage }) => {
        setStatus("deleting");
        setMessage(`Deleting "${profile.name}"...`);

        // The data goes first and throws if it will not go, so the profile stays on the list with
        // its data and its junction intact and the user can try again from the same place.
        const wasLive = await store.platform.discardProfileData(profile.uuid);
        log("Profiles", `Data for "${profile.name}" discarded; it ${wasLive ? "was" : "was not"} the live profile`);

        // Read again rather than from the snapshot taken before the delete: writing that one back
        // would restore whatever else changed while the delete was running.
        const current = useAppStore.getState();
        current.setProfiles(current.profiles.filter(p => p.uuid !== profile.uuid));
        if (current.lastLaunchedProfileUuid === profile.uuid) current.setLastLaunchedProfileUuid(null);
        current.saveData();
        current.refreshAllMods();
    }, true, FULL_PROGRESS_RESET_OPTIONS);

    log("Profiles", `Deleted "${profile.name}" (${profile.uuid}); ${useAppStore.getState().profiles.length} profiles left`);
}
