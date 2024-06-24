import {useNavigate} from "react-router-dom";
import DividedSection from "../components/DividedSection";
import MainPanel from "../components/MainPanel";
import {Profile} from "../types/Profile";
import {useState} from "react";
import {useAppState} from "../contexts/AppState";

const ProfileButton = ({profile, index}: { profile: Profile, index: number }) => {
    const [isHovered, setIsHovered] = useState(false);
    const navigate = useNavigate();
    const {setSelectedProfile} = useAppState();

    const openProfile = (profile: Profile, index: number) => {
        setSelectedProfile(index);
        navigate("/profile-editor")
    }

    return (
        <div onClick={() => openProfile(profile, index)} onMouseEnter={() => setIsHovered(true)}
             onMouseLeave={() => setIsHovered(false)}>
            <DividedSection style={{backgroundColor: isHovered ? "#5A5B5C" : "#48494A"}} className="cursor-pointer">
                <p className="minecraft-seven text-white text-[14px] px-[4px]">{profile.name}</p>
                <p className="minecraft-seven text-[#B1B2B5] text-[14px] px-[4px]">{profile.minecraft_version} ({profile.runtime})</p>
            </DividedSection>
        </div>
    )
}

export default function ProfilePage() {
    const navigate = useNavigate();
    const {allProfiles, setAllProfiles, setSelectedProfile} = useAppState();

    const NewButton = () => {
        const [isHovered, setIsHovered] = useState(false);

        return (
            <div onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)} onClick={() => {
                const defaultProfile: Profile = {
                    name: "New Profile",
                    minecraft_version: "1.21.0.3",
                    mods: [],
                    runtime: "Vanilla"
                }

                const newProfiles = [...allProfiles, defaultProfile];
                setAllProfiles(newProfiles);

                setSelectedProfile(newProfiles.length - 1);
                navigate("/profile-editor");
            }}>
                <DividedSection className="flex h-[40px] align-middle cursor-pointer"
                                style={{backgroundColor: isHovered ? "#5A5B5C" : "#48494A"}}>
                    <div>
                        <p className="minecraft-seven text-white translate-y-[-2px]">Create New Profile</p>
                    </div>
                </DividedSection>
            </div>
        )
    }

    return (
        <MainPanel>
            <DividedSection className="h-full border-y-0">
                <div className="border-[2px] border-[#1E1E1F] bg-[#313233] h-full overflow-hidden">
                    <NewButton/>

                    {allProfiles.map((profile, index) => {
                        return <ProfileButton profile={profile} index={index} key={index}/>
                    })}
                </div>
            </DividedSection>
        </MainPanel>
    )
}