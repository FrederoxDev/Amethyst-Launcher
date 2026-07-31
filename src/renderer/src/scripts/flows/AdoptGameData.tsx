import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { PopupPanel } from "@renderer/components/PopupPanel";
import AdoptChoicePopup, { AdoptIntent } from "@renderer/popups/AdoptChoicePopup";
import AdoptDeleteConfirmPopup from "@renderer/popups/AdoptDeleteConfirmPopup";
import { Channel, CHANNELS } from "@renderer/scripts/domain/Channel";
import { Profile } from "@renderer/scripts/domain/Profile";
import { useAppStore } from "@renderer/states/AppStore";
import { Popup } from "@renderer/states/PopupStore";
import { FULL_PROGRESS_RESET_OPTIONS, ProgressBar } from "@renderer/states/ProgressBarStore";
import { createProfileFlow } from "./CreateProfile";

const fs = window.require("fs") as typeof import("fs");

function describeFsError(e: unknown, contextPath: string): string {
    const message = e instanceof Error ? e.message : String(e);
    const code = (e as { code?: string } | null)?.code;

    if (code === "EBUSY" || code === "EPERM" || code === "EACCES") {
        return `"${contextPath}" is in use by another program.\n\n`
            + `Close Minecraft, any Explorer window showing this folder, OneDrive sync and the Windows Search indexer, then try again.\n\n`
            + `(${message})`;
    }
    if (code === "ENOSPC") return `Not enough disk space.\n\n(${message})`;
    return message;
}

async function showError(title: string, body: string): Promise<void> {
    await Popup.useAsync<void>(({ submit }) => (
        <PopupPanel
            title={title}
            size="md"
            footer={<MinecraftButton text="OK" onClick={() => submit()} style={{ flex: 1, minWidth: 0 }} />}
        >
            <p className="minecraft-seven" style={{ fontSize: "14px", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                {body}
            </p>
        </PopupPanel>
    ));
}

/**
 * Resolves game data sitting in a channel's folder that no profile owns, by attaching
 * it to a new profile or deleting it. Loops until the user follows through.
 */
export async function adoptGameData(channel: Channel): Promise<void> {
    const { platform } = useAppStore.getState();

    while (true) {
        const dataPath = platform.foreignGameData(channel);
        if (!dataPath) return;

        const intent = await Popup.useAsync<AdoptIntent>(({ submit }) => (
            <AdoptChoicePopup submit={submit} state={Popup.getState()} channel={channel} dataPath={dataPath} />
        ));

        if (intent === "delete") {
            const confirmed = await Popup.useAsync<boolean>(({ submit }) => (
                <AdoptDeleteConfirmPopup submit={submit} state={Popup.getState()} dataPath={dataPath} />
            ));
            if (!confirmed) continue;

            try {
                await ProgressBar.useAsync(async ({ setStatus, setMessage }) => {
                    setStatus("deleting");
                    setMessage(`Deleting ${dataPath}...`);
                    await fs.promises.rm(dataPath, { recursive: true, force: true });
                }, true, FULL_PROGRESS_RESET_OPTIONS);
                return;
            } catch (e) {
                await showError("Couldn't delete the game data", describeFsError(e, dataPath));
                continue;
            }
        }

        // Adopting: the data came out of this channel's folder, so the profile must match it.
        const created = await createProfileFlow(channel);
        if (!created) continue;

        try {
            await ProgressBar.useAsync(async ({ setStatus, setMessage }) => {
                setStatus("importing");
                setMessage(`Moving existing data into "${created.profile.name}"...`);
                await platform.adoptGameData(channel, created.profile.uuid);
            }, true, FULL_PROGRESS_RESET_OPTIONS);
            return;
        } catch (e) {
            await rollbackProfile(created.profile);
            await showError("Couldn't move the game data", describeFsError(e, dataPath));
            continue;
        }
    }
}

async function rollbackProfile(profile: Profile): Promise<void> {
    const state = useAppStore.getState();
    state.setProfiles(state.profiles.filter(p => p.uuid !== profile.uuid));
    state.saveData();
}

/** Resolves unowned data for every channel. Run at startup. */
export async function adoptAllForeignGameData(): Promise<void> {
    const { platform } = useAppStore.getState();
    for (const channel of CHANNELS) {
        if (platform.foreignGameData(channel)) await adoptGameData(channel);
    }
}
