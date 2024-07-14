import {SemVersion} from "./classes/SemVersion";
import {IsDevModeEnabled, TryEnableDevMode} from "./DeveloperMode";
import { CleanupInstall, CreateLock, DownloadVersion, ExtractVersion, InstallProxy, IsDownloaded, IsLocked, IsRegistered } from "./VersionManager";
import {RegisterVersion, UnregisterCurrent} from "./AppRegistry";
import {GetLauncherConfig, SetLauncherConfig} from "./Launcher";

import child from "child_process";
import {useAppState} from "../contexts/AppState";

export async function LaunchGame() {
    const {
        allProfiles,
        selectedProfile,
        setStatus,
        isLoading, setIsLoading,
        setLoadingPercent,
        allMinecraftVersions,
        setError
    } = useAppState();

    const log = (msg: string) => {
        console.log(msg)
        setStatus(msg)
    }

    if (isLoading) return;

    if (allProfiles.length === 0) {
        throw new Error("Cannot launch without a profile!")
    }

    const profile = allProfiles[selectedProfile];
    const semVersion = SemVersion.fromString(profile.minecraft_version);
    const minecraftVersion = allMinecraftVersions.find(version => version.version.toString() === semVersion.toString())!;

    if (minecraftVersion === undefined) {
        throw new Error(`Failed to find minecraft version ${semVersion.toString()} in the profile in allVersions!`);
    }

    setError("");
    setIsLoading(true);

    // Check that the user has developer mode enabled on windows for the game to be installed through loose files.
    if (!IsDevModeEnabled()) {
        const enabled_dev = await TryEnableDevMode();
        if (!enabled_dev) {
            throw new Error("Failed to enable 'Developer Mode' in windows settings to allow installing the game from loose files, please enable manually or make sure to press 'Yes' to enable automatically.")
        }
    }

    // We create a lock file when starting the download
    // if we are doing a launch, and we detect it for the version we are targeting
    // there is a good chance the previous install/download failed and therefore remove it.
    const didPreviousDownloadFail = IsLocked(semVersion);

    if (didPreviousDownloadFail) {
        log("Detected a .lock file from the previous download attempt, cleaning up.");
        CleanupInstall(semVersion, false);
        log("Removed previous download attempt.");
    }

    // Check for the folder for the version we are targeting, if not present we need to fetch.
    if (!IsDownloaded(semVersion)) {
        log("Target version is not downloaded.");
        CreateLock(semVersion);
        await DownloadVersion(minecraftVersion, setStatus, setLoadingPercent);
        await ExtractVersion(minecraftVersion, setStatus, setLoadingPercent);
        log("Cleaning up after successful download")
        CleanupInstall(semVersion, true);
    }

    // Only register the game if needed
    if (!IsRegistered(minecraftVersion)) {
        setStatus("Unregistering existing version");
        await UnregisterCurrent();

        setStatus("Registering downloaded version");
        await RegisterVersion(minecraftVersion)

        SetLauncherConfig(GetLauncherConfig());
    }

    setIsLoading(false);
    setStatus("");

    InstallProxy(minecraftVersion);

    const startGameCmd = `start minecraft:`;
    child.exec(startGameCmd)
}