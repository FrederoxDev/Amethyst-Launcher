import { create } from "zustand";

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
    try {
        const raw = localStorage.getItem(PENDING_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function savePending(pending: PendingDownload[]) {
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
}

export function addPendingDownload(entry: PendingDownload) {
    const pending = loadPending();
    pending.push(entry);
    savePending(pending);
}

export function removePendingDownload(id: string) {
    const pending = loadPending().filter(p => p.id !== id);
    savePending(pending);
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
    updateDownload: (id, partial) =>
        set(state => ({
            downloads: state.downloads.map(d => d.id === id ? { ...d, ...partial } : d),
        })),
    removeDownload: (id) =>
        set(state => ({
            downloads: state.downloads.filter(d => d.id !== id),
        })),
    clearCompleted: () =>
        set(state => ({
            downloads: state.downloads.filter(d => d.status !== "done" && d.status !== "error"),
        })),
}));
