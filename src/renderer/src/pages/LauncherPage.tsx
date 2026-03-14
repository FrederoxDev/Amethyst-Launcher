import warningIcon from "@renderer/assets/images/icons/warning-icon.png";

import { Dropdown } from "@renderer/components/Dropdown";
import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { useAppStore } from "@renderer/states/AppStore";
import { useShallow } from "zustand/shallow";
import ProgressBarRenderer from "@renderer/components/ProgressBarRenderer";
import { ProgressBar } from "@renderer/states/ProgressBarStore";
import { launchProfile } from "@renderer/scripts/LaunchUtils";

export function LauncherPage() {
    const [
        allProfiles,
        selectedProfile,
        setSelectedProfile,
        error,
        setError,
        minecraftIsRunning
    ] = useAppStore(useShallow(state => [
        state.allProfiles,
        state.selectedProfile,
        state.setSelectedProfile,
        state.error,
        state.setError,
        state.minecraftIsRunning
    ]));

    const launchGame = async () => {
        if (allProfiles.length === 0) {
            setError("Cannot launch without a profile!");
            return;
        }

        try {
            await launchProfile(allProfiles[selectedProfile]);
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
