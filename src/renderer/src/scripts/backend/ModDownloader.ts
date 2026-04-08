import { useAppStore } from "@renderer/states/AppStore";
import { useDownloadStore, addPendingDownload, removePendingDownload } from "@renderer/states/DownloadStore";
import { GetProfileModsPath } from "@renderer/scripts/Profiles";
import { Extractor } from "./Extractor";

const fs = window.require("fs") as typeof import("fs");
const os = window.require("os") as typeof import("os");
const path = window.require("path") as typeof import("path");

export async function downloadToTemp(
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

        console.log(`Downloaded to ${filePath}`);
        return { ok: true, path: filePath };
    } catch (e: any) {
        if (e.name === "AbortError") return { ok: false, error: "Download cancelled" };
        return { ok: false, error: e.message ?? String(e) };
    }
}

export async function importModZip(zipPath: string, profileUuid: string): Promise<void> {
    try {
        const modsPath = GetProfileModsPath(profileUuid);
        const zipName = path.basename(zipPath);
        const extractedFolderPath = path.join(modsPath, zipName.slice(0, -".zip".length));
        console.log("Extracting", zipPath, "to", extractedFolderPath);
        await Extractor.extractFile(zipPath, extractedFolderPath, [], undefined, success => {
            if (!success) {
                console.error("Extractor reported failure for:", zipPath);
            } else {
                console.log("Successfully extracted Mod ZIP!");
            }
        });
    } catch (error) {
        console.error("importModZip failed:", error);
    }
}

export function uninstallMod(modName: string, profileUuid: string): void {
    const modsPath = GetProfileModsPath(profileUuid);
    const modPath = path.join(modsPath, modName);
    if (fs.existsSync(modPath)) {
        fs.rmSync(modPath, { recursive: true, force: true });
        console.log(`Uninstalled mod: ${modName}`);
    } else {
        console.log(`Mod not found: ${modName}`);
    }
}

export interface ModDownloadEntry {
    id: string;
    name: string;
    downloadUrl: string;
    profileUuid: string;
    onComplete?: () => void;
}

export function startModDownload(entry: ModDownloadEntry): void {
    const { id, name, downloadUrl, profileUuid, onComplete } = entry;
    const abortController = new AbortController();

    useDownloadStore.getState().addDownload({
        id,
        name,
        type: "mod",
        progress: 0,
        status: "downloading",
        abortController,
    });

    addPendingDownload({ id, name, type: "mod", url: downloadUrl, profileUuid });

    downloadToTemp(
        downloadUrl,
        name + ".zip",
        (transferred, total) => {
            useDownloadStore.getState().updateDownload(id, {
                progress: total > 0 ? transferred / total : 0,
            });
        },
        abortController.signal
    ).then(async ({ ok, path: filePath, error }) => {
        if (!ok) {
            console.error(error);
            useAppStore.getState().setDownloadingMods(prev => prev.filter(n => n !== name));
            useDownloadStore.getState().updateDownload(id, { status: "error", progress: 0 });
            removePendingDownload(id);
            return;
        }

        useDownloadStore.getState().updateDownload(id, { status: "extracting", progress: 1 });
        await importModZip(filePath!, profileUuid);
        useAppStore.getState().refreshAllMods();
        useAppStore.getState().setDownloadingMods(prev => prev.filter(n => n !== name));
        useDownloadStore.getState().updateDownload(id, { status: "done" });
        removePendingDownload(id);
        onComplete?.();
    });
}
