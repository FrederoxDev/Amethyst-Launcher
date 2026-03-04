import { useNavigate } from "react-router-dom";

import { MainPanel } from "@renderer/components/MainPanel";
import { MinecraftButton } from "@renderer/components/MinecraftButton";

import { UseAppState } from "@renderer/contexts/AppState";

import { Profile } from "@renderer/scripts/Profiles";

const ProfileButton = ({ profile, index }: { profile: Profile; index: number }) => {
    const navigate = useNavigate();
    const setSelectedProfile = UseAppState(state => state.setSelectedProfile);
    const allValidMods = UseAppState(state => state.allValidMods);

    const openProfile = (index: number) => {
        setSelectedProfile(index);
        navigate("/profile-editor");
    };

    const unknownMods = profile.mods.filter(mod => !allValidMods.includes(mod));
    console.log(unknownMods);

    return (
        <div className="profile-card" onClick={() => openProfile(index)}>
            <div className="profile-card-inner">
                <p className="minecraft-seven profile-card-title">{profile.name}</p>
                <p className="minecraft-seven profile-card-subtitle">
                    {profile.minecraft_version} ({profile.runtime})
                </p>
                {unknownMods.length > 0 && (
                    <p className="minecraft-seven profile-card-warning">
                        {unknownMods.length} missing mod{unknownMods.length > 1 ? "s" : ""}!
                    </p>
                )}
            </div>
        </div>
    );
};

export function ProfilePage() {
    const navigate = useNavigate();
    const allProfiles = UseAppState(state => state.allProfiles);
    const setAllProfiles = UseAppState(state => state.setAllProfiles);
    const setSelectedProfile = UseAppState(state => state.setSelectedProfile);

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
                                name: "New Profile",
                                minecraft_version: "1.21.0.3",
                                mods: [],
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
