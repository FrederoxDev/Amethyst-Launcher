import { ipcMain, WebContents } from "electron";

import {
    DownloadOutcome,
    DownloadRequest,
    HeadResponse,
    NET_DOWNLOAD_ABORT,
    NET_DOWNLOAD_PROGRESS,
    NET_DOWNLOAD_START,
    NET_HEAD,
} from "../../shared/net/DownloadIpc";
import { describeError } from "../../shared/diagnostics/Log";
import { mainLog } from "../diagnostics/LogWriter";
import { Download, headRequest } from "./Download";

/** Progress is sent at most this often, because a chunk-by-chunk send floods the renderer. */
const PROGRESS_INTERVAL_MS = 100;

interface ActiveDownload {
    download: Download;
    contents: WebContents;
    url: string;
}

const active = new Map<string, ActiveDownload>();
const watched = new WeakSet<WebContents>();

/** A renderer that navigated away or died can no longer act on its downloads, so they stop. */
function stopDownloadsFor(contents: WebContents, why: string): void {
    for (const [id, entry] of active) {
        if (entry.contents !== contents) continue;
        mainLog("INFO", "download", `Cancelling ${id} (${entry.url}): ${why}`);
        entry.download.cancel();
    }
}

function watchContents(contents: WebContents): void {
    if (watched.has(contents)) return;
    watched.add(contents);

    contents.on("did-start-navigation", details => {
        if (!details.isMainFrame || details.isSameDocument) return;
        stopDownloadsFor(contents, `the renderer navigated to ${details.url}`);
    });
    contents.once("destroyed", () => stopDownloadsFor(contents, "the renderer was destroyed"));
    contents.on("render-process-gone", () => stopDownloadsFor(contents, "the render process is gone"));
}

function sendProgress(contents: WebContents, id: string, transferred: number, total: number): void {
    if (contents.isDestroyed()) return;
    contents.send(NET_DOWNLOAD_PROGRESS, { id, transferred, total });
}

async function startDownload(contents: WebContents, request: DownloadRequest): Promise<DownloadOutcome> {
    if (active.has(request.id)) {
        mainLog("WARN", "download", `Refusing ${request.id} for ${request.url}: that id is already downloading`);
        return { kind: "failed", message: `A download with the id ${request.id} is already running.` };
    }

    watchContents(contents);

    let lastSentAt = 0;
    const download = new Download(request, (transferred, total) => {
        const now = Date.now();
        const complete = total > 0 && transferred >= total;
        if (!complete && now - lastSentAt < PROGRESS_INTERVAL_MS) return;
        lastSentAt = now;
        sendProgress(contents, request.id, transferred, total);
    });

    active.set(request.id, { download, contents, url: request.url });
    try {
        return await download.run();
    } finally {
        active.delete(request.id);
    }
}

export function registerDownloadIpc(): void {
    ipcMain.handle(NET_HEAD, async (_event, url: string): Promise<HeadResponse> => {
        const result = await headRequest(url);
        mainLog(
            "INFO",
            "download",
            `HEAD ${url} -> ${result.error !== null ? result.error : `${result.status} ${result.statusText}`} `
            + `in ${result.ms}ms`
        );
        return result;
    });

    ipcMain.handle(NET_DOWNLOAD_START, async (event, request: DownloadRequest): Promise<DownloadOutcome> => {
        try {
            const outcome = await startDownload(event.sender, request);
            mainLog("INFO", "download", `${request.id} (${request.url}) ended: ${outcome.kind}`);
            return outcome;
        } catch (e) {
            mainLog("ERROR", "download", `${request.id} (${request.url}) threw: ${describeError(e)}`);
            return { kind: "failed", message: `Download of ${request.url} failed: ${describeError(e)}` };
        }
    });

    ipcMain.on(NET_DOWNLOAD_ABORT, (_event, id: string) => {
        const entry = active.get(id);
        if (!entry) {
            mainLog("INFO", "download", `Abort of ${id} ignored: no download carries that id`);
            return;
        }
        mainLog("INFO", "download", `Aborting ${id} (${entry.url}) at the renderer's request`);
        entry.download.cancel();
    });
}
