import child from "child_process";
import { useEffect, useRef } from "react";

import warningIcon from "@renderer/assets/images/icons/warning-icon.png";

import { Dropdown } from "@renderer/components/Dropdown";
import { MinecraftButton } from "@renderer/components/MinecraftButton";

import { UseAppState } from "@renderer/contexts/AppState";

import { SemVersion } from "@renderer/scripts/classes/SemVersion";
import { GetLauncherConfig, SetLauncherConfig } from "@renderer/scripts/Launcher";

import {
    CleanupInstall,
    CreateLock,
    DownloadVersion,
    ExtractVersion,
    InstallProxy,
    IsDownloaded,
    IsLocked,
    IsRegistered,
} from "@renderer/scripts/VersionManager";

export function LauncherPage() {
    const loadingProgressBarRef = useRef<HTMLDivElement | null>(null);

    const allProfiles = UseAppState(state => state.allProfiles);
    const selectedProfile = UseAppState(state => state.selectedProfile);
    const setSelectedProfile = UseAppState(state => state.setSelectedProfile);
    const loadingPercent = UseAppState(state => state.loadingPercent);
    const status = UseAppState(state => state.status);
    const setStatus = UseAppState(state => state.setStatus);
    const isLoading = UseAppState(state => state.isLoading);
    const setIsLoading = UseAppState(state => state.setIsLoading);
    const error = UseAppState(state => state.error);
    const setError = UseAppState(state => state.setError);
    const allMinecraftVersions = UseAppState(state => state.allMinecraftVersions);
    const setLoadingPercent = UseAppState(state => state.setLoadingPercent);
    const allValidMods = UseAppState(state => state.allValidMods);

    useEffect(() => {
        const progressBar = loadingProgressBarRef.current;
        if (!progressBar) return;

        const widthPercent = Math.max(0, Math.min(100, loadingPercent * 100));
        progressBar.style.width = `${widthPercent}%`;
    }, [loadingPercent]);

    const LaunchGame = async () => {
        const log = (msg: string) => {
            console.log(msg);
            setStatus(msg);
        };

        if (isLoading) return;

        if (allProfiles.length === 0) {
            throw new Error("Cannot launch without a profile!");
        }

        const profile = allProfiles[selectedProfile];

        const profileInvalidMods = profile.mods.filter(mod => !allValidMods.includes(mod));
        if (profileInvalidMods.length > 0) {
            throw new Error(
                `Profile has ${profileInvalidMods.length} missing mod${profileInvalidMods.length > 1 ? "s" : ""}, edit profile to launch! Missing mods: ${profileInvalidMods.map(mod => `'${mod}'`).join(", ")}`
            );
        }

        const semVersion = SemVersion.fromString(profile.minecraft_version);
        const minecraftVersion = allMinecraftVersions.find(version => version.version.matches(semVersion))!;
        console.log(allMinecraftVersions);

        if (minecraftVersion === undefined) {
            throw new Error(`Failed to find minecraft version ${semVersion.toString()} in the profile in allVersions!`);
        }

        setError("");
        setIsLoading(true);

        // if (HasGdkStableInstalled()) {
        //     setStatus("Unregistering existing GDK Stable version");
        //     UnregisterGdkStable();
        // }

        // // Check that the user has developer mode enabled on windows for the game to be installed through loose files.
        // if (!IsDevModeEnabled()) {
        //     const enabled_dev = await TryEnableDevMode();
        //     if (!enabled_dev) {
        //         throw new Error(
        //             "Failed to enable 'Developer Mode' in windows settings to allow installing the game from loose files, please enable manually or make sure to press 'Yes' to enable automatically."
        //         );
        //     }
        // }

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
            log("Cleaning up after successful download");
            CleanupInstall(semVersion, true);
        }

        // Only register the game if needed
        // if (!IsRegistered(minecraftVersion)) {
        //     setStatus("Unregistering existing version");
        //     await UnregisterCurrent();

        //     setStatus("Registering downloaded version");
        //     await RegisterVersion(minecraftVersion);

        //     SetLauncherConfig(GetLauncherConfig());
        // }

        setIsLoading(false);
        setStatus("");

        InstallProxy(minecraftVersion);

        const startGameCmd = `start minecraft:`;
        child.exec(startGameCmd);
    };

    const launchGame = async () => {
        try {
            await LaunchGame();
        } catch (e) {
            console.error(e);
            setError((e as Error).message);
            setStatus("");
            setIsLoading(false);
        }
    };

    return (
        <div className="launcher-page">
            {error === "" ? (
                <></>
            ) : (
                <>
                    <div className="launcher-error-banner">
                        <div className="launcher-error-body">
                            <img src={warningIcon} className="launcher-error-icon pixelated" alt="" />
                            <p className="minecraft-seven launcher-error-text">{error}</p>
                        </div>
                        <div className="launcher-error-actions">
                            <div className="launcher-error-close" onClick={() => setError("")}>
                                <svg width="18" height="18" viewBox="0 0 12 12">
                                    <polygon
                                        className="fill-[#FFFFFF]"
                                        fillRule="evenodd"
                                        points="11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1"
                                    />
                                </svg>
                            </div>
                        </div>
                    </div>
                </>
            )}

            <div className="launcher-footer">
                {/* Not affiliated disclaimer */}
                <div className="launcher-disclaimer">
                    <p className="minecraft-seven launcher-disclaimer-text">
                        Not approved by or associated with Mojang or Microsoft
                    </p>
                </div>

                {/* Loading bar */}
                <div
                    className={`launcher-progress ${status || isLoading ? "launcher-progress-visible" : "launcher-progress-hidden"}`}
                >
                    <div
                        ref={loadingProgressBarRef}
                        className={`launcher-progress-bar ${isLoading ? "launcher-progress-bar-visible" : "launcher-progress-bar-hidden"}`}
                    ></div>
                    <p className="minecraft-seven launcher-progress-text">
                        {status}
                    </p>
                </div>

                {/* Profile Selector & Play Button */}
                <div className="launcher-actions">
                    <div className="launcher-profile-select">
                        <Dropdown
                            labelText="Profile"
                            options={allProfiles?.map(profile => profile.name)}
                            value={allProfiles[selectedProfile]?.name}
                            setValue={value => {
                                setSelectedProfile(
                                    allProfiles.map(profile => profile.name).findIndex(e => e === value)
                                );
                            }}
                            id="profile-select"
                        />
                    </div>

                    <div className="launcher-play">
                        <MinecraftButton text="Launch Game" onClick={launchGame} />
                    </div>
                </div>
            </div>
        </div>
    );
}
