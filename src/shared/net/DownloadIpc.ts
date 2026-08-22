/** Suffix used while bytes are still arriving, so a partial file is never mistaken for a complete one. */
export const PART_SUFFIX = ".part";

export const NET_HEAD = "net:head";
export const NET_DOWNLOAD_START = "net:download:start";
export const NET_DOWNLOAD_ABORT = "net:download:abort";
export const NET_DOWNLOAD_PROGRESS = "net:download:progress";

/** What a HEAD probe learned. `error` is set only when nothing answered at all. */
export interface HeadResponse {
    ok: boolean;
    status: number;
    statusText: string;
    contentLength: number;
    /** Round trip measured in the main process, so mirrors are compared without IPC noise. */
    ms: number;
    error: string | null;
}

export interface DownloadRequest {
    /** Names this transfer for progress and abort. Made by the caller, unique per transfer. */
    id: string;
    url: string;
    destination: string;
    /** Authoritative size from a source other than the response, e.g. the GitHub asset record. */
    expectedBytes?: number;
    connectTimeoutMs?: number;
    idleTimeoutMs?: number;
    /** Total tries, including the first. */
    attempts?: number;
}

export interface DownloadProgressEvent {
    id: string;
    transferred: number;
    total: number;
}

/** How a transfer ended. A failure is reported, not thrown, so the message survives IPC intact. */
export type DownloadOutcome =
    | { kind: "done"; bytes: number }
    | { kind: "aborted"; message: string }
    | { kind: "failed"; message: string };
