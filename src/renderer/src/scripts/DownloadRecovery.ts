import { useAppStore } from "@renderer/states/AppStore";
import { useDownloadStore, getPendingDownloads, removePendingDownload, PendingDownload } from "@renderer/states/DownloadStore";
import { Extractor } from "@renderer/scripts/backend/Extractor";
import { GetProfileModsPath } from "@renderer/scripts/Profiles";

const fs = window.require("fs") as typeof import("fs");
const os = window.require("os") as typeof import("os");
const path = window.require("path") as typeof import("path");

async function downloadToTemp(
    url: string,
    filename: string,
    onProgress?: (transferred: number, total: number) => void,
    signal?: AbortSignal
): Promise<{ ok: boolean; path?: string; error?: string }> {
    try {
        const res = await fetch(url, { signal });
        if (!res.ok) return { ok: false, error: `Failed to download: ${res.statusText}` };

        const total = parseInt(res.headers.get("Content-Length") || "0", 10);
        const reader = res.body?.getReader();
        if (!reader) return { ok: false, error: "No response body" };

        const chunks: Uint8Array[] = [];
        let transferred = 0;
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                transferred += value.length;
                onProgress?.(transferred, total);
            }
        } finally {
            reader.releaseLock();
        }

        const combined = new Uint8Array(transferred);
        let offset = 0;
        for (const chunk of chunks) {
            combined.set(chunk, offset);
            offset += chunk.length;
        }

        const tempDir = os.tmpdir();
        const filePath = path.join(tempDir, filename);
        fs.writeFileSync(filePath, combined);

        return { ok: true, path: filePath };
    } catch (e: any) {
        if (e.name === "AbortError") return { ok: false, error: "Download cancelled" };
        return { ok: false, error: e.message ?? String(e) };
    }
}

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

    // Track in AppStore's downloadingMods
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

    // Ensure the mod is listed in the profile's mods array
    const postState = useAppStore.getState();
    const profiles = postState.allProfiles;
    const targetProfile = profiles.find(p => p.uuid === pending.profileUuid);
    if (targetProfile && !targetProfile.mods.includes(pending.name)) {
        postState.setAllProfiles(profiles.map(p =>
            p.uuid === pending.profileUuid ? { ...p, mods: [...p.mods, pending.name] } : p
        ));
        postState.saveData();
    }

    postState.refreshAllMods();
    useAppStore.getState().setDownloadingMods(prev => prev.filter(n => n !== pending.name));
    useDownloadStore.getState().updateDownload(pending.id, { status: "done" });
    removePendingDownload(pending.id);
}

async function resumeVersionDownload(pending: PendingDownload) {
    if (!pending.versionUuid) {
        removePendingDownload(pending.id);
        return;
    }

    // Use the version manager's existing flow which handles locking, extraction, and installation
    const versionManager = useAppStore.getState().versionManager;
    removePendingDownload(pending.id); // Remove old pending entry — downloadVersion will create a new one
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
