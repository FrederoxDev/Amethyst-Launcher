import { profile } from "console";
import DividedSection from "../components/DividedSection";
import Dropdown from "../components/Dropdown";
import MainPanel from "../components/MainPanel";
import MinecraftButton from "../components/MinecraftButton";
import { useAppState } from "../contexts/AppState";

export default function LauncherPage() {
    const { allProfiles, selectedProfile, setSelectedProfile } = useAppState();

    return (
        <MainPanel>
            <div className="flex-group">
                <img src="images/launcher_hero.png" className="object-cover w-full h-full min-h-screen" />
            </div>
            <div className="fixed bottom-0 right-0 left-[64px]">
                <div className="bg-[#0c0c0cc5] w-fit ml-auto">
                    <p className="minecraft-seven text-white px-[4px] text-[13px]">Not approved by or associated with Mojang or Microsoft</p>
                </div>
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
                        <MinecraftButton text="Launch Game" />
                    </div>
                </DividedSection>
            </div>
        </MainPanel>
    )
}