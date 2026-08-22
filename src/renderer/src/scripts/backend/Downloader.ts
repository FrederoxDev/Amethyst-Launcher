const { ipcRenderer } = window.require("electron") as typeof import("electron");

import { DownloadProgress } from "@renderer/scripts/backend/Progress";
import { log } from "@renderer/scripts/LauncherLog";
import {
    DownloadOutcome,
    DownloadProgressEvent,
    DownloadRequest,
    NET_DOWNLOAD_ABORT,
    NET_DOWNLOAD_PROGRESS,
    NET_DOWNLOAD_START,
    PART_SUFFIX,
} from "@shared/net/DownloadIpc";

export { PART_SUFFIX };

/**
 * Extra controls over a single download. Every field has a default; a caller that knows the
 * size up front should pass `expectedBytes`, because it is the only truncation check that
 * survives a chunked response.
 */
export interface DownloadOptions {
    /** Authoritative size from a source other than the response, e.g. the GitHub asset record. */
    expectedBytes?: number;
    connectTimeoutMs?: number;
    idleTimeoutMs?: number;
    /** Total tries, including the first. */
    attempts?: number;
}

const listeners = new Map<string, DownloadProgress>();

ipcRenderer.on(NET_DOWNLOAD_PROGRESS, (_event, progress: DownloadProgressEvent) => {
    listeners.get(progress.id)?.(progress.transferred, progress.total);
});

function abortError(message: string): Error {
    const error = new Error(message);
    error.name = "AbortError";
    return error;
}

export class Downloader {
    /**
     * Streams `from` to `to` in the main process, which writes through a `.part` file that is
     * renamed only after the full body has been received and flushed, and retries a stalled or
     * failed transfer a bounded number of times. Throws on any failure; there is no success flag.
     */
    static async downloadFile(
        from: string,
        to: string,
        onProgress: DownloadProgress = () => {},
        signal?: AbortSignal,
        options: DownloadOptions = {}
    ): Promise<void> {
        const id = crypto.randomUUID();

        if (signal?.aborted) {
            log("Download", `GET ${from} not started: the caller had already cancelled it`);
            throw abortError(`Download of ${from} was cancelled`);
        }

        const request: DownloadRequest = {
            id,
            url: from,
            destination: to,
            expectedBytes: options.expectedBytes,
            connectTimeoutMs: options.connectTimeoutMs,
            idleTimeoutMs: options.idleTimeoutMs,
            attempts: options.attempts,
        };

        const cancel = (): void => void ipcRenderer.send(NET_DOWNLOAD_ABORT, id);
        listeners.set(id, onProgress);
        signal?.addEventListener("abort", cancel);

        let outcome: DownloadOutcome;
        try {
            outcome = await ipcRenderer.invoke(NET_DOWNLOAD_START, request) as DownloadOutcome;
        } finally {
            listeners.delete(id);
            signal?.removeEventListener("abort", cancel);
        }

        if (outcome.kind === "done") {
            log("Download", `Saved ${outcome.bytes} bytes from ${from} to "${to}"`);
            return;
        }
        if (outcome.kind === "aborted") {
            log("Download", `Download of ${from} to "${to}" was cancelled`);
            throw abortError(outcome.message);
        }
        log("Download", `Download of ${from} to "${to}" failed: ${outcome.message}`);
        throw new Error(outcome.message);
    }
}
