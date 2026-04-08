import { useNavigate } from "react-router-dom";
import { MainPanel } from "@renderer/components/MainPanel";
import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { useAppStore } from "@renderer/states/AppStore";
import { Profile } from "@renderer/scripts/Profiles";

const ProfileButton = ({ profile, index }: { profile: Profile; index: number }) => {
    const navigate = useNavigate();
    const setSelectedProfile = useAppStore(state => state.setSelectedProfile);

    const openProfile = (index: number) => {
        setSelectedProfile(index);
        navigate("/profile-editor");
    };

    return (
        <div className="profile-card" onClick={() => openProfile(index)}>
            <div className="profile-card-inner">
                <p className="minecraft-seven profile-card-title">{profile.name}</p>
                <p className="minecraft-seven profile-card-subtitle">
                    {profile.minecraft_version} ({profile.runtime})
                </p>
            </div>
        </div>
    );
};

export function ProfilePage() {
    const navigate = useNavigate();
    const allProfiles = useAppStore(state => state.allProfiles);
    const setAllProfiles = useAppStore(state => state.setAllProfiles);
    const setSelectedProfile = useAppStore(state => state.setSelectedProfile);
    const versionDatabase = useAppStore(state => state.versionManager.database);

    return (
        <MainPanel>
            <div className="profile-page">
                <p className="minecraft-seven profile-page-title">Profile Editor</p>
                <div className="profile-page-list scrollbar">
                    {allProfiles.map((profile, index) => {
                        return <ProfileButton profile={profile} index={index} key={index} />;
                    })}
                </div>
                <div className="profile-page-footer">
                    <MinecraftButton
                        text="Create new profile"
                        onClick={() => {
                            const defaultProfile: Profile = {
                                uuid: crypto.randomUUID(),
                                name: "New Profile",
                                is_modded: false,
                                minecraft_version: versionDatabase.getAllVersions().find(v => v.type === "release")?.version.toString() ?? null,
                                runtime: "Vanilla",
                            };

                            const newProfiles = [...allProfiles, defaultProfile];
                            setAllProfiles(newProfiles);
                            setSelectedProfile(newProfiles.length - 1);
                            navigate("/profile-editor");
                        }}
                    />
                </div>
            </div>
        </MainPanel>
    );
}
