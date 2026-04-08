import { useAppStore } from "@renderer/states/AppStore";
import { SemVersion } from "@renderer/scripts/classes/SemVersion";
import { ProgressBar } from "@renderer/states/ProgressBarStore";
import { Profile } from "./Profiles";
import { SetActiveProfile } from "./Launcher";
import { GetAllMods } from "./Mods";

/**
 * Launches a profile by its UUID. Can be called from anywhere (protocol handler, UI, etc.)
 */
export async function launchProfileByUUID(profileUuid: string): Promise<void> {
    const state = useAppStore.getState();
    const profile = state.allProfiles.find(p => p.uuid === profileUuid);
    if (!profile) {
        throw new Error(`Profile with UUID ${profileUuid} not found!`);
    }
    await launchProfile(profile);
}

/**
 * Core launch logic extracted from LauncherPage. Validates mods, resolves versions, and launches.
 */
export async function launchProfile(profile: Profile): Promise<void> {
    const state = useAppStore.getState();
    const { versionManager, platform } = state;

    if (!ProgressBar.canDoAction("launch") || state.minecraftIsRunning) return;

    const profileInvalidMods = GetAllMods(profile.uuid).filter(mod => !mod.ok).map(mod => mod.id);
    if (profileInvalidMods.length > 0) {
        throw new Error(
            `Profile has ${profileInvalidMods.length} invalid mod${profileInvalidMods.length > 1 ? "s" : ""}, edit profile to launch! Invalid mods: ${profileInvalidMods.map(mod => `'${mod}'`).join(", ")}`
        );
    }

    if (!profile.minecraft_version && !profile.version_uuid) {
        throw new Error("No Minecraft version selected for this profile! Edit the profile to set one.");
    }

    // If the profile has a version_uuid, use it directly to find the installed version
    if (profile.version_uuid) {
        const installedVersion = versionManager.getInstalledVersionByUUID(profile.version_uuid);
        if (!installedVersion) {
            throw new Error(`Installed version with UUID ${profile.version_uuid} not found! It may have been deleted.`);
        }

        await ProgressBar.useAsync(async ({ setStatus, setMessage, setProgress }) => {
            setStatus("launching");
            setProgress(0.5);
            setMessage(`Preparing ${installedVersion.name}...`);

            SetActiveProfile(profile.uuid);
            await platform.runProfile(profile, installedVersion, setMessage);
        }, true);
        return;
    }

    const semVersion = SemVersion.fromString(profile.minecraft_version!);
    await versionManager.database.update();
    const minecraftVersion = versionManager.database.getVersionBySemVersion(semVersion);
    if (!minecraftVersion) {
        throw new Error(`Minecraft version ${semVersion.toString()} not found in version database!`);
    }

    await ProgressBar.useAsync(async ({ setStatus, setMessage, setProgress }) => {
        setStatus("other");
        setProgress(0);
        setMessage(`Checking version ${semVersion.toString()}...`);

        const isVersionInstalled = versionManager.getInstalledVersionByUUID(minecraftVersion.uuid) !== null;

        if (!isVersionInstalled) {
            setMessage(`Downloading ${semVersion.toString()}...`);
            await versionManager.downloadExtractAndInstallVersion(minecraftVersion.uuid);
        }
    }, true);

    await ProgressBar.useAsync(async ({ setStatus, setMessage, setProgress }) => {
        setStatus("launching");
        setProgress(0.5);
        setMessage(`Preparing ${semVersion.toString()}...`);

        const installedVersion = versionManager.getInstalledVersionByUUID(minecraftVersion.uuid);
        if (!installedVersion) {
            throw new Error("Failed to find the installed version after downloading and extracting it.");
        }

        SetActiveProfile(profile.uuid);
        await platform.runProfile(profile, installedVersion, setMessage);
    }, true);
}
