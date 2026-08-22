import { describeError } from "@shared/diagnostics/Log";
import { useAppStore } from "@renderer/states/AppStore";
import { useDownloadStore, getPendingDownloads, removePendingDownload, PendingDownload } from "@renderer/states/DownloadStore";
import { ImportModArchive, modArchiveExtension } from "@renderer/flows/ImportMod";
import { log } from "@renderer/scripts/LauncherLog";
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
        await fs.promises.rm(filePath, { force: true }).catch(cleanupError => {
            log("Recovery", `Could not delete the abandoned temp file ${filePath}: ${describeError(cleanupError)}`);
        });
        if (isAbort(e)) {
            log("Recovery", `Download of ${url} was cancelled by the user; ${filePath} deleted`);
            return { ok: false, error: "Download cancelled" };
        }
        log("Recovery", `Download of ${url} to ${filePath} failed: ${describeError(e)}`);
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
}

function describeRecoveryFailure(pending: PendingDownload, error: unknown): string {
    const reason = error instanceof Error ? error.message : String(error);
    return `Could not finish downloading ${pending.name}: ${reason}`;
}

/** Clears the in-flight bookkeeping and shows the user why the resumed download stopped. */
function failRecovery(pending: PendingDownload, message: string): void {
    log("Recovery", `Giving up on ${pending.type} "${pending.name}" (${pending.id}): ${message}`);
    useAppStore.getState().setDownloadingMods(prev => prev.filter(n => n !== pending.name));
    useDownloadStore.getState().updateDownload(pending.id, { status: "error", progress: 0 });
    removePendingDownload(pending.id);
    useAppStore.getState().setError(message);
}

async function resumeModDownload(pending: PendingDownload): Promise<void> {
    log("Recovery", `Resuming mod download "${pending.name}" (${pending.id}) from ${pending.url}`);
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
        failRecovery(pending, `Could not finish downloading ${pending.name}: ${error}`);
        return;
    }

    useDownloadStore.getState().updateDownload(pending.id, { status: "extracting", progress: 1 });

    try {
        await ImportModArchive(filePath!);
    } catch (e) {
        log("Recovery", `Installing the resumed archive ${filePath} failed: ${describeError(e)}`);
        failRecovery(pending, e instanceof Error ? e.message : String(e));
        return;
    } finally {
        await fs.promises.rm(filePath!, { force: true }).catch(cleanupError => {
            log("Recovery", `Could not delete the temp archive ${filePath}: ${describeError(cleanupError)}`);
        });
    }

    useAppStore.getState().setDownloadingMods(prev => prev.filter(n => n !== pending.name));
    useDownloadStore.getState().updateDownload(pending.id, { status: "done" });
    removePendingDownload(pending.id);
    log("Recovery", `Resumed mod "${pending.name}" installed`);
}

async function resumeVersionDownload(pending: PendingDownload): Promise<void> {
    removePendingDownload(pending.id);
    if (!pending.versionUuid) {
        log("Recovery", `Dropping pending version "${pending.name}" (${pending.id}): the saved entry carries no versionUuid`);
        useAppStore.getState().setError(
            `Could not resume the download of ${pending.name} because the saved entry is incomplete. Install it again from the versions list.`
        );
        return;
    }

    log("Recovery", `Resuming version install "${pending.name}" (${pending.versionUuid})`);
    try {
        await useAppStore.getState().versions.resolveOrInstall(pending.versionUuid);
        log("Recovery", `Resumed version "${pending.name}" installed`);
    } catch (e) {
        log("Recovery", `Resuming version "${pending.name}" (${pending.versionUuid}) failed: ${describeError(e)}`);
        const reason = e instanceof Error ? e.message : String(e);
        useAppStore.getState().setError(`Could not finish installing ${pending.name}: ${reason}`);
    }
}

export function resumePendingDownloads(): void {
    const pending = getPendingDownloads();
    if (pending.length === 0) {
        log("Recovery", "No downloads were left in flight by a previous session");
        return;
    }

    log(
        "Recovery",
        `Resuming ${pending.length} download(s) left by a previous session: `
        + `${pending.map(p => `${p.type} "${p.name}" (${p.id})`).join(", ")}`
    );

    for (const entry of pending) {
        if (entry.type === "mod") {
            resumeModDownload(entry).catch(e => failRecovery(entry, describeRecoveryFailure(entry, e)));
        } else if (entry.type === "version") {
            resumeVersionDownload(entry).catch(e => {
                log("Recovery", `Unhandled failure resuming "${entry.name}": ${describeError(e)}`);
                useAppStore.getState().setError(describeRecoveryFailure(entry, e));
            });
        } else {
            log("Recovery", `Dropping pending download "${entry.name}" (${entry.id}): unknown type "${entry.type}"`);
            removePendingDownload(entry.id);
        }
    }
}
