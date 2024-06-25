import Dropdown from "../components/Dropdown";
import MainPanel from "../components/MainPanel";
import MinecraftButton from "../components/MinecraftButton";
import {useAppState} from "../contexts/AppState";
import {SemVersion} from "../types/SemVersion";
import {readLauncherConfig, saveLauncherConfig} from "../launcher/Modlist";
import { isDeveloperModeEnabled, tryEnableDeveloperMode } from "../versionSwitcher/DeveloperMode";
import { registerVersion, unregisterExisting } from "../versionSwitcher/AppRegistry";
import { cleanupFailedInstall, cleanupSuccessfulInstall, copyProxyToInstalledVer, createLockFile, downloadVersion, extractVersion, isLockFilePresent, isRegisteredVersionOurs, isVersionDownloaded } from "../versionSwitcher/VersionManager";

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
            const didPreviousDownloadFail = isLockFilePresent(semVersion);
            
            if (didPreviousDownloadFail) {
                log("Detected a .lock file from the previous download attempt, cleaning up.");
                cleanupFailedInstall(semVersion);
                log("Removed previous download attempt.");
            }

            // Check for the folder for the version we are targeting, if not present we need to fetch.
            if (!isVersionDownloaded(semVersion)) {
                log("Target version is not downloaded.");
                createLockFile(semVersion);
                await downloadVersion(minecraftVersion, setStatus, setLoadingPercent);
                await extractVersion(minecraftVersion, setStatus, setLoadingPercent);
                log("Cleaning up after successful download")
                cleanupSuccessfulInstall(semVersion);
            }

            // Only register the game if needed
            if (!isRegisteredVersionOurs(minecraftVersion)) {
                setStatus("Unregistering existing version");
                await unregisterExisting();

                setStatus("Registering downloaded version");
                await registerVersion(minecraftVersion)

                saveLauncherConfig(readLauncherConfig());
            }

            setIsLoading(false);
            setStatus("");

            copyProxyToInstalledVer(minecraftVersion);

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
        <MainPanel>

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

            <div className="flex-group">
                <img src="images/art/snow.png" className="object-cover w-full h-full min-h-screen" alt="" />
            </div>

            <div className="fixed bottom-0 right-0 left-[66px]">
                {/* Not affliated disclaimer */}
                <div className="bg-[#0c0c0cc5] w-fit ml-auto">
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
                <div className="flex gap-[8px] border-b-[0px] pb-1 border-t-[#1E1E1F] border-y-[2px] border-solid border-b-[#1E1E1F] p-[8px] bg-[#48494A]">
                    <div className="w-[30%] translate-y-[-1px]">
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

        </MainPanel>
    )
}