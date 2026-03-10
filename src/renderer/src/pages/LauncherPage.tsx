import warningIcon from "@renderer/assets/images/icons/warning-icon.png";

import { Dropdown } from "@renderer/components/Dropdown";
import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { useAppStore } from "@renderer/states/AppStore";
import { SemVersion } from "@renderer/scripts/classes/SemVersion";
import { useShallow } from "zustand/shallow";
import ProgressBarRenderer from "@renderer/components/ProgressBarRenderer";
import { FULL_PROGRESS_RESET_OPTIONS, ProgressBar } from "@renderer/states/ProgressBarStore";

export function LauncherPage() {
    const [
        allProfiles,
        selectedProfile,
        setSelectedProfile,
        error,
        setError,
        allValidMods,
        versionManager,
        platform,
        minecraftIsRunning
    ] = useAppStore(useShallow(state => [
        state.allProfiles,
        state.selectedProfile,
        state.setSelectedProfile,
        state.error,
        state.setError,
        state.allValidMods,
        state.versionManager,
        state.platform,
        state.minecraftIsRunning
    ]));

    const currentStatus = ProgressBar.useState(state => state.currentStatus);

    const LaunchGame = async () => {
        const log = (msg: string) => {
            console.log(msg);
        };

        if (!ProgressBar.canDoAction("launch") || minecraftIsRunning) 
            return;
        ProgressBar.getState().setStatus("launching");

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
        await versionManager.database.update();
        const minecraftVersion = versionManager.database.getVersionBySemVersion(semVersion);
        if (!minecraftVersion) {
            throw new Error(`Minecraft version ${semVersion.toString()} not found in version database!`);
        }

        await ProgressBar.useAsync(async ({ setStatus, setMessage, setProgress, setShow }) => {
            setStatus("other");
            setProgress(0);
            setMessage(`Preparing to launch Minecraft ${semVersion.toString()}...`);

            const isVersionInstalled = versionManager.getInstalledVersionByUUID(minecraftVersion.uuid) !== null;

            // Check for the folder for the version we are targeting, if not present we need to fetch.
            if (!isVersionInstalled) {
                log("Target version is not installed.");
                await versionManager.downloadExtractAndInstallVersion(minecraftVersion.uuid);
            }
        }, true);

        // InstallProxy(minecraftVersion);

        await ProgressBar.useAsync(async ({ setStatus, setMessage, setProgress }) => {
            setStatus("launching");
            setProgress(0.5);
            setMessage(`Launching Minecraft ${semVersion.toString()}...`);

            const installedVersion = versionManager.getInstalledVersionByUUID(minecraftVersion.uuid);
            if (!installedVersion) {
                throw new Error("Failed to find the installed version after downloading and extracting it.");
            }
            
            await platform.runProfile(profile, installedVersion);
        }, true);
    };

    const launchGame = async () => {
        try {
            await LaunchGame();
        } catch (e) {
            console.error(e);
            setError((e as Error).message);
            ProgressBar.reset();
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
                <ProgressBarRenderer />

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
                        <MinecraftButton text="Launch Game" onClick={launchGame} disabled={!ProgressBar.canDoAction("launch") || minecraftIsRunning} />
                    </div>
                </div>
            </div>
        </div>
    );
}
