import { useAppStore } from "@renderer/states/AppStore";
import { useDownloadStore, getPendingDownloads, removePendingDownload, PendingDownload } from "@renderer/states/DownloadStore";
import { downloadToTemp } from "@renderer/scripts/backend/ModDownloader";
import { Extractor } from "@renderer/scripts/backend/Extractor";
import { GetProfileModsPath } from "@renderer/scripts/Profiles";

const path = window.require("path") as typeof import("path");

async function resumeModDownload(pending: PendingDownload) {
    const dlStore = useDownloadStore.getState();
    const abortController = new AbortController();

    dlStore.addDownload({
        id: pending.id,
        name: pending.name,
        type: "mod",
        progress: 0,
        status: "downloading",
        abortController,
    });

    const appState = useAppStore.getState();
    appState.setDownloadingMods([...appState.downloadingMods, pending.name]);

    const { ok, path: filePath, error } = await downloadToTemp(
        pending.url,
        pending.name + ".zip",
        (transferred, total) => {
            useDownloadStore.getState().updateDownload(pending.id, {
                progress: total > 0 ? transferred / total : 0,
            });
        },
        abortController.signal
    );

    if (!ok) {
        console.error(`Recovery download failed for ${pending.name}:`, error);
        useAppStore.getState().setDownloadingMods(prev => prev.filter(n => n !== pending.name));
        useDownloadStore.getState().updateDownload(pending.id, { status: "error", progress: 0 });
        removePendingDownload(pending.id);
        return;
    }

    useDownloadStore.getState().updateDownload(pending.id, { status: "extracting", progress: 1 });

    if (!pending.profileUuid) {
        console.error("[Recovery] No profileUuid in pending download, skipping:", pending.name);
        useAppStore.getState().setDownloadingMods(prev => prev.filter(n => n !== pending.name));
        useDownloadStore.getState().updateDownload(pending.id, { status: "error", progress: 0 });
        removePendingDownload(pending.id);
        return;
    }

    const extractedPath = path.join(GetProfileModsPath(pending.profileUuid), pending.name);
    await Extractor.extractFile(filePath!, extractedPath, [], undefined, success => {
        if (!success) console.error("Failed to extract mod during recovery:", pending.name);
    });

    useAppStore.getState().refreshAllMods();
    useAppStore.getState().setDownloadingMods(prev => prev.filter(n => n !== pending.name));
    useDownloadStore.getState().updateDownload(pending.id, { status: "done" });
    removePendingDownload(pending.id);
}

async function resumeVersionDownload(pending: PendingDownload) {
    if (!pending.versionUuid) {
        removePendingDownload(pending.id);
        return;
    }

    const versionManager = useAppStore.getState().versionManager;
    removePendingDownload(pending.id);
    try {
        await versionManager.downloadExtractAndInstallVersion(pending.versionUuid);
    } catch (e) {
        console.error(`Recovery version download failed for ${pending.name}:`, e);
    }
}

export function resumePendingDownloads() {
    const pending = getPendingDownloads();
    if (pending.length === 0) return;

    console.log(`Resuming ${pending.length} pending download(s) from previous session`);

    for (const entry of pending) {
        if (entry.type === "mod") {
            resumeModDownload(entry);
        } else if (entry.type === "version") {
            resumeVersionDownload(entry);
        } else {
            removePendingDownload(entry.id);
        }
    }
}
