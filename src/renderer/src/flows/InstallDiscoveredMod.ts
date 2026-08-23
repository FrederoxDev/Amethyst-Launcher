import { Downloader } from "@renderer/scripts/backend/Downloader";
import { ModRelease } from "@renderer/scripts/discovery/GithubReleases";
import { recordDownload } from "@renderer/scripts/discovery/ModCatalog";
import { ImportModArchive, modArchiveExtension } from "@renderer/flows/ImportMod";
import { log } from "@renderer/scripts/LauncherLog";
import { useAppStore } from "@renderer/states/AppStore";
import { addPendingDownload, removePendingDownload, useDownloadStore } from "@renderer/states/DownloadStore";
import { describeError, userMessage } from "@shared/diagnostics/Log";

const fs = window.require("fs") as typeof import("fs");
const os = window.require("os") as typeof import("os");
const path = window.require("path") as typeof import("path");

export type AttachOutcome = "added" | "already-listed" | "profile-missing";

/** True for an abort anywhere in the cause chain, since Downloader wraps the original error. */
function wasCancelled(error: unknown): boolean {
    for (let e: unknown = error; e instanceof Error; e = e.cause) {
        if (e.name === "AbortError") return true;
    }
    return false;
}

export function attachModToProfile(profileUuid: string, modName: string): AttachOutcome {
    const state = useAppStore.getState();
    const profile = state.profiles.find(p => p.uuid === profileUuid);

    if (!profile) {
        log("ModDiscovery", `Could not add "${modName}" to profile ${profileUuid}: no profile has that uuid`);
        return "profile-missing";
    }

    if (profile.mods.includes(modName)) {
        log("ModDiscovery", `"${modName}" not added: profile "${profile.name}" (${profile.uuid}) already lists it`);
        return "already-listed";
    }

    state.setProfiles(state.profiles.map(p => (p.uuid === profileUuid ? { ...p, mods: [...p.mods, modName] } : p)));
    state.saveData();
    log("ModDiscovery", `Added "${modName}" to profile "${profile.name}" (${profile.uuid})`);
    return "added";
}

function reportAttachFailure(outcome: AttachOutcome, modName: string): void {
    if (outcome !== "profile-missing") return;
    useAppStore
        .getState()
        .setError(
            `${modName} is installed, but the profile it was meant for no longer exists. Add it from the profile editor.`
        );
}

export function attachInstalledMod(profileUuid: string, modName: string): void {
    reportAttachFailure(attachModToProfile(profileUuid, modName), modName);
}

interface InstallRequest {
    /** Firestore document id of the catalog entry, for the download counter. */
    modId: string;
    release: ModRelease;
    /** Profile to add the mod to once installed, or null to install it standalone. */
    profileUuid: string | null;
}

/**
 * Downloads a release into a directory of its own and installs it, so two installs of the same
 * mod name cannot overwrite each other's archive.
 */
export async function installDiscoveredMod({ modId, release, profileUuid }: InstallRequest): Promise<void> {
    const modName = release.downloadName;

    if (profileUuid !== null) reportAttachFailure(attachModToProfile(profileUuid, modName), modName);

    const appState = useAppStore.getState();
    appState.setDownloadingMods([...appState.downloadingMods, modName]);

    const downloadId = `mod-${modName}-${Date.now()}`;
    const abortController = new AbortController();
    useDownloadStore.getState().addDownload({
        id: downloadId,
        name: modName,
        type: "mod",
        progress: 0,
        status: "downloading",
        abortController,
    });

    addPendingDownload({
        id: downloadId,
        name: modName,
        type: "mod",
        url: release.downloadUrl,
    });

    const finish = (status: "done" | "error", message?: string): void => {
        useAppStore.getState().setDownloadingMods(prev => prev.filter(n => n !== modName));
        useDownloadStore.getState().updateDownload(downloadId, {
            status,
            ...(status === "error" ? { progress: 0 } : {}),
        });
        removePendingDownload(downloadId);
        if (message !== undefined) useAppStore.getState().setError(message);
    };

    let tempDir: string;
    try {
        tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "amethyst-mod-"));
    } catch (e) {
        log("ModDiscovery", `Could not make a temp folder for "${modName}": ${describeError(e)}`);
        finish("error", `Could not start downloading ${modName}: ${userMessage(e)}`);
        return;
    }

    const archivePath = path.join(tempDir, modName + modArchiveExtension(release.downloadUrl));

    try {
        await Downloader.downloadFile(
            release.downloadUrl,
            archivePath,
            (transferred, total) => {
                useDownloadStore.getState().updateDownload(downloadId, {
                    progress: total > 0 ? transferred / total : 0,
                });
            },
            abortController.signal
        );

        useDownloadStore.getState().updateDownload(downloadId, { status: "extracting", progress: 1 });
        await ImportModArchive(archivePath);
    } catch (e) {
        if (wasCancelled(e)) {
            log("ModDiscovery", `Install of "${modName}" was cancelled by the user`);
            finish("error");
        } else {
            log("ModDiscovery", `Installing "${modName}" from ${release.downloadUrl} failed: ${describeError(e)}`);
            finish("error", `Could not install ${modName}: ${userMessage(e)}`);
        }
        return;
    } finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(cleanupError => {
            log("ModDiscovery", `Could not delete the temp folder ${tempDir}: ${describeError(cleanupError)}`);
        });
    }

    finish("done");
    await recordDownload(modId);
}

export async function uninstallMod(modName: string): Promise<void> {
    const modPath = path.join(useAppStore.getState().platform.getPaths().modsPath, modName);
    try {
        await fs.promises.rm(modPath, { recursive: true, force: true });
        log("ModDiscovery", `Uninstalled "${modName}" by deleting ${modPath}`);
    } catch (e) {
        log("ModDiscovery", `Uninstalling "${modName}" from ${modPath} failed: ${describeError(e)}`);
        throw new Error(`Could not remove ${modName}: ${userMessage(e)}`, { cause: e });
    }
}
