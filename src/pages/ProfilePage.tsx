import {useNavigate} from "react-router-dom";
import MainPanel from "../components/MainPanel";
import {Profile} from "../types/Profile";
import {useState} from "react";
import {useAppState} from "../contexts/AppState";
import MinecraftButton from "../components/MinecraftButton";

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
            <div style={{backgroundColor: isHovered ? "#5A5B5C" : "#48494A"}} className="cursor-pointer border-[2px] border-solid border-t-[#5A5B5C] border-[#1E1E1F] m-[4px] p-[8px] bg-[#48494A]">
                <p className="minecraft-seven text-white text-[14px] px-[4px]">{profile.name}</p>
                <p className="minecraft-seven text-[#B1B2B5] text-[14px] px-[4px]">{profile.minecraft_version} ({profile.runtime})</p>
            </div>
        </div>
    )
}

export default function ProfilePage() {
    const navigate = useNavigate();
    const {allProfiles, setAllProfiles, setSelectedProfile} = useAppState();

    return (
        <MainPanel>
            <div className="flex flex-col h-full p-[8px] bg-[#48494A] overflow-hidden">

                <div className="border-[2px] border-[#1E1E1F] h-full p-[4px] bg-[#313233] overflow-y-auto" style={{scrollbarWidth: "none", scrollbarColor: "#48494A #313233"}}>
                    {
                        allProfiles.map((profile, index) => {
                            return <ProfileButton profile={profile} index={index} key={index}/>
                        })
                    }
                </div>

                <div className="bg-[#48494A] h-fit mt-[4px] translate-y-[4px]">
                    <MinecraftButton text="Create new profile" onClick={() => {
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
                    }}/>
                </div>

            </div>
        </MainPanel>
    )
}