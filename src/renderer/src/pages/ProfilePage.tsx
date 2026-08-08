import { useNavigate } from "react-router-dom";
import { describeError } from "@shared/diagnostics/Log";
import { MainPanel } from "@renderer/components/MainPanel";
import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { useAppStore } from "@renderer/states/AppStore";
import { log } from "@renderer/scripts/LauncherLog";
import { channelLabel } from "@renderer/scripts/domain/Channel";
import { Profile } from "@renderer/scripts/domain/Profile";
import { launchProfileByUuid } from "@renderer/scripts/flows/Launch";
import { createProfileFlow } from "@renderer/scripts/flows/CreateProfile";
import { displayVersion } from "@renderer/scripts/flows/ProfileActions";
import { ProgressBar } from "@renderer/states/ProgressBarStore";

const { ipcRenderer } = window.require("electron") as typeof import("electron");

ipcRenderer.on("AMETHYST_PROTOCOL_URL", async (_event, url: string) => {
    log("Protocol", `Handling ${url}`);

    try {
        const parsed = new URL(url);
        // amethyst-launcher://launchprofile/<uuid>
        if (parsed.hostname !== "launchprofile") {
            log("Protocol", `Ignoring ${url}: "${parsed.hostname}" is not an action this launcher knows`);
            return;
        }

        const profileUuid = parsed.pathname.replace(/^\//, "");
        if (!profileUuid) {
            log("Protocol", `Ignoring ${url}: launchprofile carries no profile UUID after the slash`);
            return;
        }

        await launchProfileByUuid(profileUuid);
    } catch (e) {
        log("Protocol", `Handling ${url} failed: ${describeError(e)}`);
        useAppStore.getState().setError((e as Error).message);
        ProgressBar.reset();
    }
});

const ProfileButton = ({ profile, index }: { profile: Profile; index: number }) => {
    const navigate = useNavigate();
    const setEditingProfileIndex = useAppStore(state => state.setEditingProfileIndex);
    const allValidMods = useAppStore(state => state.allValidMods);

    const unknownMods = profile.mods.filter(mod => !allValidMods.includes(mod));

    return (
        <div
            className="profile-card"
            onClick={() => {
                setEditingProfileIndex(index);
                navigate("/profile-editor");
            }}
        >
            <div className="profile-card-inner">
                <p className="minecraft-seven profile-card-title">{profile.name}</p>
                <p className="minecraft-seven profile-card-subtitle">
                    {displayVersion(profile)} &middot; {channelLabel(profile.channel)} ({profile.runtime})
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
                    {profiles.map((profile, index) => (
                        <ProfileButton profile={profile} index={index} key={profile.uuid} />
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
