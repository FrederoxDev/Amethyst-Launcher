import { useNavigate } from "react-router-dom";
import { MainPanel } from "@renderer/components/MainPanel";
import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { useAppStore } from "@renderer/states/AppStore";
import { channelLabel } from "@renderer/scripts/domain/Channel";
import { Profile, isModded } from "@renderer/scripts/domain/Profile";
import { createProfileFlow } from "@renderer/flows/CreateProfile";
import { displayVersion } from "@renderer/flows/ProfileActions";

const ProfileButton = ({ profile }: { profile: Profile }) => {
    const navigate = useNavigate();
    const setEditingProfileUuid = useAppStore(state => state.setEditingProfileUuid);
    const allValidMods = useAppStore(state => state.allValidMods);

    const unknownMods = profile.mods.filter(mod => !allValidMods.includes(mod));

    return (
        <div
            className="profile-card"
            onClick={() => {
                setEditingProfileUuid(profile.uuid);
                navigate("/profile-editor");
            }}
        >
            <div className="profile-card-inner">
                <p className="minecraft-seven profile-card-title">{profile.name}</p>
                <p className="minecraft-seven profile-card-subtitle">
                    {displayVersion(profile)} &middot; {channelLabel(profile.channel)} (
                    {isModded(profile) ? "Modded" : "Vanilla"})
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
    const profiles = useAppStore(state => state.profiles);

    return (
        <MainPanel>
            <div className="profile-page">
                <p className="minecraft-seven profile-page-title">Profile Editor</p>
                <div className="profile-page-list scrollbar">
                    {profiles.map(profile => (
                        <ProfileButton profile={profile} key={profile.uuid} />
                    ))}
                </div>
                <div className="profile-page-footer">
                    <MinecraftButton
                        text="Create new profile"
                        onClick={async () => {
                            const created = await createProfileFlow();
                            if (created) navigate("/profile-editor");
                        }}
                    />
                </div>
            </div>
        </MainPanel>
    );
}
