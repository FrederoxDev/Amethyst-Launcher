import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { PopupPanel } from "@renderer/components/PopupPanel";

import OnboardingChoicePopup, { OnboardingIntent } from "@renderer/popups/OnboardingChoicePopup";
import OnboardingDeleteConfirmPopup from "@renderer/popups/OnboardingDeleteConfirmPopup";
import { NewInstancePopup, NewInstanceResult } from "@renderer/popups/NewInstancePopup";
import { VersionPickerPopup, VersionPickerResult } from "@renderer/popups/VersionPickerPopup";

import { SemVersion } from "@renderer/scripts/classes/SemVersion";
import { useAppStore } from "@renderer/states/AppStore";
import { Popup } from "@renderer/states/PopupStore";
import { FULL_PROGRESS_RESET_OPTIONS, ProgressBar } from "@renderer/states/ProgressBarStore";

import { Profile } from "./Profiles";
import { MinecraftVersionType } from "./VersionDatabase";
import {
    ensureParentExists,
    inspectRoamingState,
    isProfileDataInitialized,
    markProfileDataInitialized,
    moveDirectory,
    resolveRoamingPath,
} from "./ProfileDataLinker";

const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");

interface Candidate {
    type: MinecraftVersionType;
    roamingPath: string;
}

interface ImportPlan {
    name: string;
    isModded: boolean;
    minecraftVersion: string;
    versionUuid: string | null;
}

/**
 * On first launcher open, prompt the user to import or delete any pre-existing
 * Minecraft Bedrock data found under %APPDATA%. Writes the initialized marker
 * when finished so the prompt never shows again.
 *
 * Safe to call on every startup — exits immediately if the marker already exists.
 */
export async function runFirstLaunchOnboarding(): Promise<void> {
    const store = useAppStore.getState();
    const profileDataRoot = store.platform.getPaths().profileDataPath;

    if (isProfileDataInitialized(profileDataRoot)) return;

    const candidates: Candidate[] = [];
    for (const type of ["release", "preview"] as const) {
        const roamingPath = resolveRoamingPath(type);
        const state = inspectRoamingState(roamingPath);
        if (state.kind === "real-dir" && !state.empty) {
            candidates.push({ type, roamingPath });
        }
    }

    if (candidates.length === 0) {
        markProfileDataInitialized(profileDataRoot);
        return;
    }

    for (const candidate of candidates) {
        await handleCandidate(candidate, profileDataRoot);
    }

    markProfileDataInitialized(profileDataRoot);
}

async function handleCandidate(candidate: Candidate, profileDataRoot: string): Promise<void> {
    // Loop until the user picks an action *and* follows through. Cancelling out
    // of any sub-popup drops us back to the choice screen — onboarding cannot
    // be deferred. Errors during the action also drop back to the choice screen
    // so the user can retry or pick a different action.
    while (true) {
        const intent = await Popup.useAsync<OnboardingIntent>(({ submit }) => (
            <OnboardingChoicePopup
                submit={submit}
                state={Popup.getState()}
                type={candidate.type}
                roamingPath={candidate.roamingPath}
            />
        ));

        if (intent === "delete") {
            const confirmed = await Popup.useAsync<boolean>(({ submit }) => (
                <OnboardingDeleteConfirmPopup
                    submit={submit}
                    state={Popup.getState()}
                    roamingPath={candidate.roamingPath}
                />
            ));
            if (!confirmed) continue;

            try {
                await deleteData(candidate);
                return;
            } catch (e) {
                await showOnboardingError(
                    "Couldn't delete the Minecraft data",
                    describeFsError(e, candidate.roamingPath)
                );
                continue;
            }
        }

        // intent === "import"
        const plan = await collectImportPlan();
        if (plan === null) continue; // user backed out of version picker / name picker

        try {
            await importAsProfile(candidate, plan, profileDataRoot);
            return;
        } catch (e) {
            await showOnboardingError(
                "Couldn't import the Minecraft data",
                describeFsError(e, candidate.roamingPath)
            );
            continue;
        }
    }
}

/**
 * Walks the user through picking a Minecraft version and naming the instance.
 * Mirrors the flow used by `createProfileFlow` for full feature parity (version
 * download, MSIXVC import, reselect, etc.). Returns null if the user cancelled
 * somewhere along the way.
 */
async function collectImportPlan(): Promise<ImportPlan | null> {
    let versionResult = await Popup.useAsync<VersionPickerResult | null>(props => (
        <VersionPickerPopup {...props} />
    ));
    if (!versionResult) return null;

    while (true) {
        const instanceResult = await Popup.useAsync<NewInstanceResult | null>(props => (
            <NewInstancePopup {...props} versionLabel={versionResult!.display_name} />
        ));
        if (!instanceResult) return null;

        if (instanceResult.kind === "reselect") {
            const newVersion = await Popup.useAsync<VersionPickerResult | null>(props => (
                <VersionPickerPopup {...props} />
            ));
            if (!newVersion) return null;
            versionResult = newVersion;
            continue;
        }

        // If this was an imported MSIXVC, kick off the install in the background.
        // It can't share our ProgressBar (we hold the busy flag during the data
        // move below), so it surfaces via the existing DownloadStore panel — same
        // contract as `createProfileFlow`. The profile will be unlaunchable until
        // the install finishes, which is expected and surfaced when the user tries
        // to play (LaunchUtils throws "Installed version with UUID X not found").
        if (versionResult.importData) {
            const data = versionResult.importData;
            const versionManager = useAppStore.getState().versionManager;
            versionManager.installVersion({
                kind: "imported",
                name: data.name,
                version: SemVersion.fromString(data.version),
                type: data.type.toLowerCase() as MinecraftVersionType,
                uuid: data.uuid,
                file: data.file,
            }).then(() => {
                console.log("[Onboarding] Imported version installed successfully");
            }).catch(e => {
                console.error("[Onboarding] Failed to install imported version:", e);
                useAppStore.getState().setError(`Failed to install imported version: ${(e as Error).message ?? e}`);
            });
        }

        return {
            name: instanceResult.name,
            isModded: instanceResult.runtime === "modded",
            minecraftVersion: versionResult.minecraft_version,
            versionUuid: versionResult.version_uuid,
        };
    }
}

async function importAsProfile(
    candidate: Candidate,
    plan: ImportPlan,
    profileDataRoot: string
): Promise<void> {
    const newUuid = crypto.randomUUID();
    const targetPath = path.join(profileDataRoot, newUuid);

    await ProgressBar.useAsync(async (state) => {
        state.setStatus("importing");
        state.setMessage(`Importing data as "${plan.name}"...`);

        ensureParentExists(targetPath);

        let moved = false;
        try {
            await moveDirectory(candidate.roamingPath, targetPath);
            moved = true;

            const newProfile: Profile = {
                uuid: newUuid,
                name: plan.name,
                is_modded: plan.isModded,
                runtime: "Vanilla",
                mods: [],
                minecraft_version: plan.minecraftVersion,
                version_uuid: plan.versionUuid,
            };

            const store = useAppStore.getState();
            // Defensive guard: crypto.randomUUID() collisions are astronomically
            // improbable, but a duplicate would silently shadow an existing profile.
            if (store.allProfiles.some(p => p.uuid === newUuid)) {
                throw new Error(`UUID collision for new profile (${newUuid}) — this should never happen.`);
            }
            store.setAllProfiles([...store.allProfiles, newProfile]);
            store.saveData();
        } catch (e) {
            if (moved) {
                // Try to put the data back so the user doesn't lose access. The
                // init marker hasn't been written yet, so onboarding will detect
                // it again on next launch.
                try {
                    await moveDirectory(targetPath, candidate.roamingPath);
                } catch (restoreErr) {
                    // Both the import and the restore failed. The data is at
                    // targetPath but no profile points at it. Surface a clear
                    // recovery path so the user can rescue it manually.
                    throw new Error(
                        `Failed to register the new profile, and could not put the data back at "${candidate.roamingPath}".\n\n` +
                        `Your data is safe at:\n${targetPath}\n\n` +
                        `To recover, close the launcher and move that folder back to "${candidate.roamingPath}", then restart.\n\n` +
                        `Original error: ${formatError(e)}\nRestore error: ${formatError(restoreErr)}`
                    );
                }
            }
            throw e;
        }
    }, true, FULL_PROGRESS_RESET_OPTIONS);
}

async function deleteData(candidate: Candidate): Promise<void> {
    await ProgressBar.useAsync(async (state) => {
        state.setStatus("deleting");
        state.setMessage(`Deleting Minecraft data at ${candidate.roamingPath}...`);
        await fs.promises.rm(candidate.roamingPath, { recursive: true, force: true });
    }, true, FULL_PROGRESS_RESET_OPTIONS);
}

function formatError(e: unknown): string {
    if (e instanceof Error) return e.message;
    return String(e);
}

/**
 * Produce a user-friendly explanation of an fs error. We can't show stack traces
 * inside a popup — the user needs to know what to actually do.
 */
function describeFsError(e: unknown, contextPath: string): string {
    const msg = formatError(e);
    const code = (e as { code?: string } | null)?.code;

    if (code === "EBUSY" || code === "EPERM" || code === "EACCES") {
        return (
            `"${contextPath}" is in use by another program.\n\n` +
            `Close Minecraft, File Explorer windows pointing at this folder, OneDrive sync, and Windows Search indexer, then try again.\n\n` +
            `(Details: ${msg})`
        );
    }
    if (code === "ENOSPC") {
        return `Not enough disk space.\n\n(Details: ${msg})`;
    }
    return msg;
}

async function showOnboardingError(title: string, body: string): Promise<void> {
    await Popup.useAsync<void>(({ submit }) => (
        <PopupPanel
            title={title}
            size="md"
            footer={
                <MinecraftButton
                    text="OK"
                    onClick={() => submit()}
                    style={{ flex: 1, minWidth: 0 }}
                />
            }
        >
            <p className="minecraft-seven" style={{ fontSize: "14px", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                {body}
            </p>
        </PopupPanel>
    ));
}
