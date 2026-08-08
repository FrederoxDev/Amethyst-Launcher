import { create } from "zustand";

import { describeError } from "@shared/diagnostics/Log";
import { log } from "@renderer/scripts/LauncherLog";

export interface DownloadItem {
    id: string;
    name: string;
    type: "mod" | "version";
    progress: number;
    status: "queued" | "downloading" | "extracting" | "done" | "error";
    abortController: AbortController | null;
}

/** Serializable metadata for crash recovery — stored in localStorage */
export interface PendingDownload {
    id: string;
    name: string;
    type: "mod" | "version";
    url: string;
    /** For mods: the profile index to add the mod to */
    profileIndex?: number;
    /** For versions: the version UUID */
    versionUuid?: string;
}

const PENDING_KEY = "amethyst_pending_downloads";

function loadPending(): PendingDownload[] {
    const raw = localStorage.getItem(PENDING_KEY);
    if (raw === null) return [];
    try {
        return JSON.parse(raw);
    } catch (e) {
        // Dropping the record silently would lose downloads with no trace of why.
        log("Downloads", `Discarding unreadable ${PENDING_KEY} (${describeError(e)}); it held: ${raw.slice(0, 400)}`);
        return [];
    }
}

function savePending(pending: PendingDownload[]) {
    try {
        localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    } catch (e) {
        log("Downloads", `Could not save ${pending.length} pending download(s) to ${PENDING_KEY}: ${describeError(e)}`);
    }
}

export function addPendingDownload(entry: PendingDownload) {
    const pending = loadPending();
    pending.push(entry);
    savePending(pending);
    log("Downloads", `Recorded pending ${entry.type} "${entry.name}" (${entry.id}) from ${entry.url} for crash recovery`);
}

export function removePendingDownload(id: string) {
    const before = loadPending();
    const pending = before.filter(p => p.id !== id);
    if (pending.length === before.length) return;
    savePending(pending);
    log("Downloads", `Cleared pending download ${id}; ${pending.length} still recorded`);
}

export function getPendingDownloads(): PendingDownload[] {
    return loadPending();
}

export function clearAllPending() {
    localStorage.removeItem(PENDING_KEY);
}

interface DownloadStoreState {
    downloads: DownloadItem[];
    panelOpen: boolean;
    setPanelOpen: (open: boolean) => void;
    addDownload: (item: DownloadItem) => void;
    updateDownload: (id: string, partial: Partial<DownloadItem>) => void;
    removeDownload: (id: string) => void;
    clearCompleted: () => void;
}

export const useDownloadStore = create<DownloadStoreState>((set) => ({
    downloads: [],
    panelOpen: false,
    setPanelOpen: (open) => set({ panelOpen: open }),
    addDownload: (item) =>
        set(state => ({
            downloads: [...state.downloads, item],
            panelOpen: true,
        })),
    // Only status transitions are logged; progress updates arrive many times a second.
    updateDownload: (id, partial) =>
        set(state => {
            if (partial.status !== undefined) {
                const current = state.downloads.find(d => d.id === id);
                if (current && current.status !== partial.status) {
                    log("Downloads", `"${current.name}" (${id}): ${current.status} -> ${partial.status}`);
                }
            }
            return { downloads: state.downloads.map(d => d.id === id ? { ...d, ...partial } : d) };
        }),
    removeDownload: (id) =>
        set(state => ({
            downloads: state.downloads.filter(d => d.id !== id),
        })),
    clearCompleted: () =>
        set(state => ({
            downloads: state.downloads.filter(d => d.status !== "done" && d.status !== "error"),
        })),
}));
