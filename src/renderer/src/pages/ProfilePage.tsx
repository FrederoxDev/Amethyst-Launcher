import { useNavigate } from "react-router-dom";
import { MainPanel } from "@renderer/components/MainPanel";
import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { useAppStore } from "@renderer/states/AppStore";
import { Profile } from "@renderer/scripts/Profiles";
import { launchProfileByUUID } from "@renderer/scripts/LaunchUtils";
import { ProgressBar } from "@renderer/states/ProgressBarStore";

const { ipcRenderer } = window.require("electron") as typeof import("electron");

ipcRenderer.on("AMETHYST_PROTOCOL_URL", async (_event, url: string) => {
    console.log(`[renderer] Protocol URL received: ${url}`);

    try {
        const parsed = new URL(url);
        // amethyst-launcher://launchprofile/<uuid>
        if (parsed.hostname === "launchprofile") {
            const profileUuid = parsed.pathname.replace(/^\//, "");
            if (profileUuid) {
                await launchProfileByUUID(profileUuid);
            }
        }
    } catch (e) {
        console.error("[renderer] Failed to handle protocol URL:", e);
        useAppStore.getState().setError((e as Error).message);
        ProgressBar.reset();
    }
});

const ProfileButton = ({ profile, index }: { profile: Profile; index: number }) => {
    const navigate = useNavigate();
    const setEditingProfile = useAppStore(state => state.setEditingProfile);
    const allValidMods = useAppStore(state => state.allValidMods);

    const openProfile = (index: number) => {
        setEditingProfile(index);
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
    const allProfiles = useAppStore(state => state.allProfiles);
    const setAllProfiles = useAppStore(state => state.setAllProfiles);
    const setEditingProfile = useAppStore(state => state.setEditingProfile);
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
                                mods: [],
                                runtime: "Vanilla",
                            };

                            const newProfiles = [...allProfiles, defaultProfile];
                            setAllProfiles(newProfiles);
                            setEditingProfile(newProfiles.length - 1);
                            navigate("/profile-editor");
                        }}
                    />
                </div>
            </div>
        </MainPanel>
    );
}
