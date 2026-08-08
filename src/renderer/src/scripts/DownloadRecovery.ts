import { useAppStore } from "@renderer/states/AppStore";
import { useDownloadStore, getPendingDownloads, removePendingDownload, PendingDownload } from "@renderer/states/DownloadStore";
import { ImportModArchive, modArchiveExtension } from "@renderer/scripts/flows/ImportMod";
import { Downloader } from "@renderer/scripts/backend/Downloader";

const fs = window.require("fs") as typeof import("fs");
const os = window.require("os") as typeof import("os");
const path = window.require("path") as typeof import("path");

/** True for an abort anywhere in the cause chain, since Downloader wraps the original error. */
function isAbort(error: unknown): boolean {
    for (let e: unknown = error; e instanceof Error; e = e.cause) {
        if (e.name === "AbortError") return true;
    }
    return false;
}

/**
 * Streams the archive straight to a temp file. Downloader validates the received byte count
 * against Content-Length and renames a `.part` file into place only once it is complete,
 * so a truncated response can never be reported as `ok`.
 */
async function downloadToTemp(
    url: string,
    filename: string,
    onProgress?: (transferred: number, total: number) => void,
    signal?: AbortSignal
): Promise<{ ok: boolean; path?: string; error?: string }> {
    const filePath = path.join(os.tmpdir(), path.basename(filename));
    try {
        await Downloader.downloadFile(url, filePath, (transferred, total) => onProgress?.(transferred, total), signal);
        return { ok: true, path: filePath };
    } catch (e) {
        await fs.promises.rm(filePath, { force: true }).catch(() => {});
        if (isAbort(e)) return { ok: false, error: "Download cancelled" };
        console.error("[DownloadRecovery] Download failed.", { url, filePath }, e);
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
}

function describeRecoveryFailure(pending: PendingDownload, error: unknown): string {
    const reason = error instanceof Error ? error.message : String(error);
    return `Could not finish downloading ${pending.name}: ${reason}`;
}

/** Clears the in-flight bookkeeping and shows the user why the resumed download stopped. */
function failRecovery(pending: PendingDownload, message: string): void {
    useAppStore.getState().setDownloadingMods(prev => prev.filter(n => n !== pending.name));
    useDownloadStore.getState().updateDownload(pending.id, { status: "error", progress: 0 });
    removePendingDownload(pending.id);
    useAppStore.getState().setError(message);
}

async function resumeModDownload(pending: PendingDownload): Promise<void> {
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
        pending.name + modArchiveExtension(pending.url),
        (transferred, total) => {
            useDownloadStore.getState().updateDownload(pending.id, {
                progress: total > 0 ? transferred / total : 0,
            });
        },
        abortController.signal
    );

    if (!ok) {
        console.error(`[DownloadRecovery] Download failed for ${pending.name}:`, { url: pending.url, error });
        failRecovery(pending, `Could not finish downloading ${pending.name}: ${error}`);
        return;
    }

    useDownloadStore.getState().updateDownload(pending.id, { status: "extracting", progress: 1 });

    try {
        await ImportModArchive(filePath!);
    } catch (e) {
        console.error(`[DownloadRecovery] Install failed for ${pending.name}:`, { archive: filePath }, e);
        failRecovery(pending, e instanceof Error ? e.message : String(e));
        return;
    } finally {
        await fs.promises.rm(filePath!, { force: true }).catch(() => {});
    }

    useAppStore.getState().setDownloadingMods(prev => prev.filter(n => n !== pending.name));
    useDownloadStore.getState().updateDownload(pending.id, { status: "done" });
    removePendingDownload(pending.id);
}

async function resumeVersionDownload(pending: PendingDownload): Promise<void> {
    removePendingDownload(pending.id);
    if (!pending.versionUuid) {
        console.error(`[DownloadRecovery] Pending version download for ${pending.name} has no version id; dropping it.`);
        useAppStore.getState().setError(
            `Could not resume the download of ${pending.name} because the saved entry is incomplete. Install it again from the versions list.`
        );
        return;
    }

    try {
        await useAppStore.getState().versions.resolveOrInstall(pending.versionUuid);
    } catch (e) {
        console.error(`[DownloadRecovery] Version install failed for ${pending.name}:`, { uuid: pending.versionUuid }, e);
        const reason = e instanceof Error ? e.message : String(e);
        useAppStore.getState().setError(`Could not finish installing ${pending.name}: ${reason}`);
    }
}

export function resumePendingDownloads(): void {
    const pending = getPendingDownloads();
    if (pending.length === 0) return;

    console.log(`Resuming ${pending.length} pending download(s) from previous session`);

    for (const entry of pending) {
        if (entry.type === "mod") {
            resumeModDownload(entry).catch(e => failRecovery(entry, describeRecoveryFailure(entry, e)));
        } else if (entry.type === "version") {
            resumeVersionDownload(entry).catch(e => {
                console.error(`[DownloadRecovery] Unhandled failure resuming ${entry.name}:`, e);
                useAppStore.getState().setError(describeRecoveryFailure(entry, e));
            });
        } else {
            console.error(`[DownloadRecovery] Dropping pending download of unknown type '${entry.type}'.`, entry);
            removePendingDownload(entry.id);
        }
    }
}
