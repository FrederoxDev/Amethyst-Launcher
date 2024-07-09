import Dropdown from "../components/Dropdown";
import MinecraftButton from "../components/MinecraftButton";
import {useAppState} from "../contexts/AppState";
import {SemVersion} from "../scripts/classes/SemVersion";
import { readLauncherConfig, saveLauncherConfig } from "../scripts/Launcher";
import { isDeveloperModeEnabled, tryEnableDeveloperMode } from "../scripts/DeveloperMode";
import { RegisterVersion, UnregisterCurrent } from "../scripts/AppRegistry";
import { CleanupInstall, TransferProxy, CreateLock, DownloadVersion, ExtractVersion, IsLocked, isRegisteredVersionOurs, IsDownloaded } from "../scripts/VersionManager";

const child = window.require('child_process') as typeof import('child_process')

export default function LauncherPage() {
    const {
        allProfiles, selectedProfile, setSelectedProfile, loadingPercent, status, setStatus, isLoading, setIsLoading,
        setLoadingPercent, allMinecraftVersions, error, setError
    } = useAppState();

    const log = (msg: string) => {
        console.log(msg)
        setStatus(msg)
    }

    const launchGame = async () => {
        if (isLoading) return;

        try {
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
            if (!isDeveloperModeEnabled()) {
                const couldEnableDev = await tryEnableDeveloperMode();
                if (!couldEnableDev) {
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
            if (!isRegisteredVersionOurs(minecraftVersion)) {
                setStatus("Unregistering existing version");
                await UnregisterCurrent();

                setStatus("Registering downloaded version");
                await RegisterVersion(minecraftVersion)

                saveLauncherConfig(readLauncherConfig());
            }

            setIsLoading(false);
            setStatus("");

            TransferProxy(minecraftVersion);

            const startGameCmd = `start minecraft:`;
            child.exec(startGameCmd)
        } catch (e: unknown) {
            console.log(e);
            setError((e as Error).message);
            setStatus("");
            setIsLoading(false);
        }
    }

    return (
        <div className="relative w-full h-full">

            {error === "" ? <></> : (
                    <>
                        <div className="bg-red-500 w-full">
                            <p className="minecraft-seven text-[14px]">There was an error while trying to launch the
                                game!</p>
                            <div className="bg-red-600 h-[2px] w-full min-h-[2px]"></div>
                            <p className="minecraft-seven text-[13px]">{error}</p>
                        </div>
                        <div className="bg-red-600 h-[2px] w-full min-h-[2px]"></div>
                    </>
                )
            }

            

            <div className="absolute bottom-0 w-full">
                {/* Not affliated disclaimer */}
                <div className="bg-[#0c0c0cc5] w-fit ml-auto rounded-t-[3px]">
                    <p className="minecraft-seven text-white px-[4px] text-[13px]">Not approved by or associated with
                        Mojang or Microsoft</p>
                </div>


                {/* Loading bar */}
                <div
                    className={`bg-[#313233] ${isLoading ? "h-[25px]" : "h-0"} transition-all duration-300 ease-in-out`}>
                    <div
                        className={`bg-[#3C8527] absolute ${isLoading ? "min-h-[25px]" : "min-h-0"} transition-all duration-300 ease-in-out`}
                        style={{width: `${loadingPercent * 100}%`}}
                    ></div>
                    <p className='minecraft-seven absolute z-30 text-white overflow-hidden text-ellipsis whitespace-nowrap max-w-full px-2'>{status}</p>
                </div>

                {/* Profile Selector & Play Button */}
                <div className="flex gap-[8px] border-[#1E1E1F] border-[3px] p-[8px] bg-[#48494A]">
                    <div className="w-[30%] translate-y-[5px]">
                        <Dropdown
                            labelText="Profile"
                            options={allProfiles?.map(profile => profile.name)}
                            value={allProfiles[selectedProfile]?.name}
                            setValue={(value) => {
                                setSelectedProfile(allProfiles.map(profile => profile.name).findIndex(e => e === value));
                            }}
                            id="profile-select"
                        />
                    </div>

                    <div className="w-[70%]">
                        <MinecraftButton text="Launch Game" onClick={launchGame}/>
                    </div>

                </div>
            </div>

        </div>
    )
}