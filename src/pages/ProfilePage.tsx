import { useNavigate } from "react-router-dom";
import DividedSection from "../components/DividedSection";
import MainPanel from "../components/MainPanel";
import { Profile } from "../types/Profile";

let profiles: Profile[] = [
    {
        name: "Profile 1",
        mods: [],
        runtime: "AmethystRuntime@1.2.0",
        minecraft_version: "1.20.51.1"
    },
    {
        name: "Profile 2",
        mods: [],
        runtime: "AmethystRuntime@1.2.0",
        minecraft_version: "1.20.51.1"
    },
]

export default function ProfilePage() {
    const navigate = useNavigate();

    const openProfile = (profile: Profile) => {
        navigate("/profile-editor")
    }

    const profileButton = (profile: Profile) => {
        return (
            <div className="bg-[#48494A] box-border border-b-[#5A5B5C] border-b-[2px] px-[4px] flex h-[44px] hover:bg-[#5A5B5C] cursor-pointer" 
                onClick={() => openProfile(profile)}
            >
                <div>
                    <p className="minecraft-seven text-white text-[14px] px-[4px]">{ profile.name }</p>
                    <p className="minecraft-seven text-[#B1B2B5] text-[14px] px-[4px]">{ profile.minecraft_version }</p>
                </div>
            </div>
        )
    }

    return (
        <MainPanel>
            <DividedSection className="h-full">
                <div className="border-[2px] border-[#1E1E1F] bg-[#313233] h-full overflow-hidden">
                    {profiles.map(profileButton)}
                </div>
            </DividedSection>
        </MainPanel>
    )
}