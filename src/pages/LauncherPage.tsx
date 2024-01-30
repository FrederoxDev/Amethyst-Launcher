import DividedSection from "../components/DividedSection";
import Dropdown from "../components/Dropdown";
import MainPanel from "../components/MainPanel";
import MinecraftButton from "../components/MinecraftButton";
import { useAppState } from "../contexts/AppState";
import { downloadVersion, extractVersion, getMinecraftVersions, isVersionDownloaded } from "../versionSwitcher/VersionManager";
import { MinecraftVersion, VersionType } from "../types/MinecraftVersion";
import { SemVersion } from "../types/SemVersion";



export default function LauncherPage() {
    const { allProfiles, selectedProfile, setSelectedProfile, loadingPercent, status, setStatus, isLoading, setIsLoading, setLoadingPercent} = useAppState();

    const launchGame = async () => {
        const profile = allProfiles[selectedProfile];
        const semVersion = SemVersion.fromString(profile.minecraft_version);
        console.log(semVersion)

        setIsLoading(true);

        if (!isVersionDownloaded(semVersion)) {
            const allVersions = await getMinecraftVersions();
            const minecraftVersion = allVersions.find(version => version.version.toString() == semVersion.toString());

            if (minecraftVersion === undefined) {
                throw new Error(`Failed to find version ${semVersion.toString()}`);
            }

            await downloadVersion(minecraftVersion, setStatus, setLoadingPercent);
            await extractVersion(minecraftVersion, setStatus, setLoadingPercent);
        }

        setIsLoading(false);
    }

    return (
        <MainPanel>
            <div className="flex-group">
                <img src="images/launcher_hero.png" className="object-cover w-full h-full min-h-screen" />
            </div>
            <div className="fixed bottom-0 right-0 left-[64px]">
                {/* Not affliated disclaimer */}
                <div className="bg-[#0c0c0cc5] w-fit ml-auto">
                    <p className="minecraft-seven text-white px-[4px] text-[13px]">Not approved by or associated with Mojang or Microsoft</p>
                </div>

                {/* Loading bar */}
                <div className={`bg-[#313233] ${isLoading ? "h-[25px]" : "h-0"} transition-all duration-300 ease-in-out`}>
                    <div className={`bg-[#3C8527] absolute ${isLoading ? "min-h-[25px]" : "min-h-0"} transition-all duration-300 ease-in-out`} 
                    style={{width: `${loadingPercent * 100}%`}}
                ></div>
                    <p className='minecraft-seven absolute z-30 text-white overflow-hidden text-ellipsis whitespace-nowrap max-w-full px-2'>{status}</p>
                </div>

                {/* Profile Selector & Play Button */}
                <DividedSection className="flex gap-[8px]">
                    <div className="w-[30%]">
                        <Dropdown 
                            labelText="Profile"
                            options={allProfiles?.map(profile => profile.name)}
                            value={ allProfiles[selectedProfile]?.name }
                            setValue={(value) => {
                                setSelectedProfile(allProfiles.map(profile => profile.name).findIndex(e => e == value));
                            }}
                            id="profile-select"
                        />
                    </div>
                    <div className="w-[70%]">
                        <MinecraftButton text="Launch Game" onClick={launchGame} />
                    </div>
                </DividedSection>
            </div>
        </MainPanel>
    )
}