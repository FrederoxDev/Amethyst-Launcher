import { describeError } from "@shared/diagnostics/Log";
import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { PopupPanel } from "@renderer/components/PopupPanel";
import AdoptChoicePopup, { AdoptIntent } from "@renderer/popups/AdoptChoicePopup";
import AdoptDeleteConfirmPopup from "@renderer/popups/AdoptDeleteConfirmPopup";
import { Channel, CHANNELS } from "@renderer/scripts/domain/Channel";
import { Profile } from "@renderer/scripts/domain/Profile";
import { log } from "@renderer/scripts/LauncherLog";
import { useAppStore } from "@renderer/states/AppStore";
import { Popup } from "@renderer/states/PopupStore";
import { FULL_PROGRESS_RESET_OPTIONS, ProgressBar } from "@renderer/states/ProgressBarStore";
import { createProfileFlow } from "./CreateProfile";

const fs = window.require("fs") as typeof import("fs");

/**
 * What is actually in the folder about to be moved or deleted. The `.ent` files are called out
 * on their own: an entitlement that arrives with adopted data is the one case where a brand new
 * profile starts life holding a licence it did not acquire, and that has to be traceable.
 */
function describeFolder(target: string): string {
    try {
        const entries = fs.readdirSync(target, { withFileTypes: true });
        const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
        const files = entries.filter(e => e.isFile()).map(e => e.name);
        const licences = files.filter(name => name.toLowerCase().endsWith(".ent"));
        return (
            `folders: [${dirs.join(", ") || "none"}]; files: [${files.join(", ") || "none"}]; ` +
            `licence files: [${licences.join(", ") || "none"}]`
        );
    } catch (e) {
        return `unreadable (${describeError(e)})`;
    }
}

function describeFsError(e: unknown, contextPath: string): string {
    const message = e instanceof Error ? e.message : String(e);
    const code = (e as { code?: string } | null)?.code;

    if (code === "EBUSY" || code === "EPERM" || code === "EACCES") {
        return (
            `"${contextPath}" is in use by another program.\n\n` +
            `Close Minecraft, any Explorer window showing this folder, OneDrive sync and the Windows Search indexer, then try again.\n\n` +
            `(${message})`
        );
    }
    if (code === "ENOSPC") return `Not enough disk space.\n\n(${message})`;
    return message;
}

async function showError(title: string, body: string): Promise<void> {
    await Popup.ask<void>(({ submit }) => (
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
        if (!dataPath) {
            log("Adopt", `Nothing to adopt for ${channel}: no game data outside a profile`);
            return;
        }

        log("Adopt", `Unowned ${channel} game data at ${dataPath}; ${describeFolder(dataPath)}`);

        const intent = await Popup.ask<AdoptIntent>(({ submit }) => (
            <AdoptChoicePopup submit={submit} state={Popup.getState()} channel={channel} dataPath={dataPath} />
        ));
        log("Adopt", `User chose to ${intent} the ${channel} data at ${dataPath}`);

        if (intent === "delete") {
            const confirmed = await Popup.ask<boolean>(({ submit }) => (
                <AdoptDeleteConfirmPopup submit={submit} state={Popup.getState()} dataPath={dataPath} />
            ));
            if (!confirmed) {
                log("Adopt", `Deletion of ${dataPath} cancelled at the confirmation, asking again`);
                continue;
            }

            try {
                await ProgressBar.runAsync(
                    async ({ setStatus, setMessage }) => {
                        setStatus("deleting");
                        setMessage(`Deleting ${dataPath}...`);
                        log("Adopt", `Deleting ${dataPath} permanently; it held ${describeFolder(dataPath)}`);
                        await fs.promises.rm(dataPath, { recursive: true, force: true });
                    },
                    true,
                    FULL_PROGRESS_RESET_OPTIONS
                );
                log("Adopt", `Deleted ${dataPath}`);
                return;
            } catch (e) {
                log("Adopt", `Deleting ${dataPath} failed: ${describeError(e)}`);
                await showError("Couldn't delete the game data", describeFsError(e, dataPath));
                continue;
            }
        }

        // Adopting: the data came out of this channel's folder, so the profile must match it.
        const created = await createProfileFlow(channel);
        if (!created) {
            log("Adopt", `Adoption of ${dataPath} abandoned: the user backed out of creating a profile for it`);
            continue;
        }

        try {
            await ProgressBar.runAsync(
                async ({ setStatus, setMessage }) => {
                    setStatus("importing");
                    setMessage(`Moving existing data into "${created.profile.name}"...`);
                    log(
                        "Adopt",
                        `Moving ${channel} data from ${dataPath} into profile "${created.profile.name}" ` +
                            `(${created.profile.uuid}); source holds ${describeFolder(dataPath)}`
                    );
                    await platform.adoptGameData(channel, created.profile.uuid);
                },
                true,
                FULL_PROGRESS_RESET_OPTIONS
            );
            const adoptedInto = platform.profileDataDir(created.profile.uuid);
            log(
                "Adopt",
                `Adoption finished: "${created.profile.name}" (${created.profile.uuid}) now owns ${adoptedInto}; ` +
                    `it holds ${describeFolder(adoptedInto)}`
            );
            return;
        } catch (e) {
            log("Adopt", `Moving ${dataPath} into "${created.profile.name}" failed: ${describeError(e)}`);
            await rollbackAdoption(channel, created.profile);
            await showError("Couldn't move the game data", describeFsError(e, dataPath));
            continue;
        }
    }
}

/**
 * Undoes a failed adoption, the copy as well as the profile record. Leaving the copy behind
 * doubled the disk the data takes on every retry, and nothing ever came back for it.
 *
 * Only while the data is still where it came from. A move that got as far as emptying the source
 * has put the user's only copy of their worlds inside the profile, and deleting that to tidy up
 * after a failure would be the failure.
 */
async function rollbackAdoption(channel: Channel, profile: Profile): Promise<void> {
    const { platform } = useAppStore.getState();
    const copied = platform.profileDataDir(profile.uuid);

    if (!platform.foreignGameData(channel)) {
        log(
            "Adopt",
            `Keeping "${profile.name}" (${profile.uuid}): the ${channel} data is no longer where it came from, ` +
                `so ${copied} holds the only copy of it`
        );
        return;
    }

    log("Adopt", `Rolling back "${profile.name}" (${profile.uuid}) and the half-adopted copy at ${copied}`);
    try {
        await platform.discardProfileData(profile.uuid);
    } catch (e) {
        log("Adopt", `Could not delete the half-adopted copy at ${copied}: ${describeError(e)}`);
    }

    const state = useAppStore.getState();
    state.setProfiles(state.profiles.filter(p => p.uuid !== profile.uuid));
    state.saveData();
}

/** Resolves unowned data for every channel. Run at startup. */
export async function adoptAllForeignGameData(): Promise<void> {
    const { platform } = useAppStore.getState();
    for (const channel of CHANNELS) {
        const found = platform.foreignGameData(channel);
        if (!found) {
            log("Adopt", `Startup check: no unowned ${channel} game data`);
            continue;
        }
        log("Adopt", `Startup check: unowned ${channel} game data at ${found}`);
        await adoptGameData(channel);
    }
}
