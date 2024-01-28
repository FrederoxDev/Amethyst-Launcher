import { useNavigate } from "react-router-dom";
import DividedSection from "../components/DividedSection";
import MainPanel from "../components/MainPanel";
import { Profile } from "../types/Profile";
import { useState } from "react";
import { useAppState } from "../contexts/AppState";

export default function ProfilePage() {
    const navigate = useNavigate();
    const { allProfiles, setSelectedProfile } = useAppState();

    const openProfile = (profile: Profile, index: number) => {
        setSelectedProfile(index);
        navigate("/profile-editor")
    }

    const ProfileButton = (profile: Profile, index: number) => {
        const [ isHovered, setIsHovered ] = useState(false);

        return (
            <div onClick={() => openProfile(profile, index)} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
                <DividedSection style={{ backgroundColor: isHovered ? "#5A5B5C" : "#48494A" }} className="cursor-pointer">
                    <p className="minecraft-seven text-white text-[14px] px-[4px]">{ profile.name }</p>
                    <p className="minecraft-seven text-[#B1B2B5] text-[14px] px-[4px]">{ profile.minecraft_version } ({ profile.runtime })</p>
                </DividedSection>
            </div>
        )
    }

    return (
        <MainPanel>
            <DividedSection className="h-full">
                <div className="border-[2px] border-[#1E1E1F] bg-[#313233] h-full overflow-hidden">
                    {allProfiles.map(ProfileButton)}
                </div>
            </DividedSection>
        </MainPanel>
    )
}