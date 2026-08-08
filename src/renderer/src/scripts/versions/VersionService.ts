import { SemVersion } from "@renderer/scripts/classes/SemVersion";
import { Channel } from "@renderer/scripts/domain/Channel";
import { errnoCode } from "@renderer/scripts/Directories";
import { FileLocker } from "@renderer/scripts/FileLocker";
import { CIK_KEYS } from "@renderer/scripts/backend/Decryption";
import { Downloader, PART_SUFFIX } from "@renderer/scripts/backend/Downloader";
import { LauncherTools } from "@renderer/scripts/backend/tools/LauncherTools";
import { LauncherPaths } from "@renderer/scripts/platform/LauncherPlatform";
import { FULL_PROGRESS_RESET_OPTIONS, ProgressBar } from "@renderer/states/ProgressBarStore";
import { addPendingDownload, removePendingDownload, useDownloadStore } from "@renderer/states/DownloadStore";
import { Catalog, CatalogVersion, catalogLabel } from "./Catalog";
import { InstalledVersion, artifactSlug } from "./InstalledVersion";
import { Library } from "./Library";

const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");

type Events = {
    installed: (version: InstalledVersion) => void;
    uninstalled: (uuid: string) => void;
};

export interface ImportRequest {
    label: string;
    version: SemVersion;
    channel: Channel;
    uuid: string;
    file: string;
}

/** The appx family a build registers as, read from the build itself. */
function readPackageFamily(versionPath: string): string {
    const manifest = path.join(versionPath, "appxmanifest.xml");
    const family = fs.readFileSync(manifest, "utf-8").match(/<Identity\s+Name="([^"]+)"/)?.[1];
    if (!family) throw new Error(`${manifest}: no <Identity Name>`);
    return family;
}

async function fastestMirror(urls: string[]): Promise<string> {
    const probes = await Promise.all(urls.map(async url => {
        const start = performance.now();
        try {
            const response = await fetch(url, { method: "HEAD" });
            if (!response.ok) return null;
            return { url, ms: performance.now() - start, size: parseInt(response.headers.get("content-length") ?? "0") };
        } catch {
            return null;
        }
    }));

    const live = probes.filter((p): p is { url: string; ms: number; size: number } => p !== null);
    if (live.length === 0) throw new Error(`No download mirror responded (tried ${urls.length}).`);
    live.sort((a, b) => a.ms - b.ms);
    return live[0].url;
}

export class VersionService {
    readonly catalog: Catalog;
    readonly library: Library;

    private subscribers = new Map<keyof Events, Set<(...args: never[]) => void>>();

    constructor(private readonly paths: LauncherPaths) {
        this.catalog = new Catalog(paths.cachedVersionsFilePath);
        this.library = new Library(paths.versionsPath);
    }

    subscribe<E extends keyof Events>(event: E, callback: Events[E]): () => void {
        const listeners = this.subscribers.get(event) ?? new Set();
        listeners.add(callback as (...args: never[]) => void);
        this.subscribers.set(event, listeners);
        return () => void listeners.delete(callback as (...args: never[]) => void);
    }

    private emit<E extends keyof Events>(event: E, ...args: Parameters<Events[E]>): void {
        for (const cb of this.subscribers.get(event) ?? []) (cb as (...a: unknown[]) => void)(...args);
    }

    private artifactPaths(slug: string) {
        return {
            msixvc: path.join(this.paths.versionsPath, `${slug}.msixvc`),
            folder: path.join(this.paths.versionsPath, slug),
            lockName: `${slug}.msixvc`,
        };
    }

    /** Clears locks and partial downloads left by a session that didn't exit cleanly. */
    async cleanupStaleLocks(): Promise<void> {
        let entries: string[];
        try {
            entries = await fs.promises.readdir(this.paths.versionsPath);
        } catch (e) {
            if (errnoCode(e) === "ENOENT") return;
            throw e;
        }

        const locker = FileLocker.get();
        for (const entry of entries) {
            if (!entry.endsWith(".lock")) continue;

            const lockPath = path.join(this.paths.versionsPath, entry);
            const basePath = lockPath.replace(/\.lock$/, "");
            if (locker.isLocked(basePath)) continue;

            await fs.promises.rm(lockPath, { force: true });
            await fs.promises.rm(basePath + PART_SUFFIX, { force: true });
            try {
                if ((await fs.promises.stat(basePath)).isFile()) {
                    await fs.promises.rm(basePath, { force: true });
                }
            } catch (e) {
                if (errnoCode(e) !== "ENOENT") throw e;
            }
        }
    }

    private async withLock<T>(lockName: string, label: string, body: () => Promise<T>): Promise<T> {
        const lockPath = path.join(this.paths.versionsPath, lockName);
        if (FileLocker.get().isLocked(lockPath)) {
            throw new Error(`${label} is already being installed. Wait for that to finish.`);
        }
        FileLocker.get().lockFile(lockPath);
        try {
            return await body();
        } finally {
            FileLocker.get().unlockFile(lockPath);
        }
    }

    private async decryptAndExtract(msixvc: string, folder: string, label: string): Promise<void> {
        await ProgressBar.useAsync(async ({ setStatus, setMessage, setProgress }) => {
            await LauncherTools.XVDTool.check();

            setStatus("decrypting");
            setMessage(`Decrypting ${label}...`);
            setProgress(0.5);
            await LauncherTools.XVDTool.decryptFile(msixvc, CIK_KEYS, false);

            setStatus("extracting");
            setMessage(`Extracting ${label}...`);
            setProgress(0);
            const error = await LauncherTools.XVDTool.extractFile(msixvc, folder, false);
            if (error) throw new Error(`Could not extract ${label} (${error})`);
        });
    }

    /** Downloads, extracts and registers a catalog version. Resolves to the installed record. */
    async install(catalogVersion: CatalogVersion): Promise<InstalledVersion> {
        const existing = this.library.byUuid(catalogVersion.uuid);
        if (existing) return existing;

        const label = catalogLabel(catalogVersion);
        const slug = artifactSlug(catalogVersion.version.toString(), catalogVersion.channel, catalogVersion.uuid);
        const { msixvc, folder, lockName } = this.artifactPaths(slug);

        fs.mkdirSync(this.paths.versionsPath, { recursive: true });

        return this.withLock(lockName, label, async () => {
            const mirror = await fastestMirror(catalogVersion.urls);
            const head = await fetch(mirror, { method: "HEAD" });
            if (!head.ok) throw new Error(`Download mirror returned ${head.status} for ${label}`);
            const expectedSize = parseInt(head.headers.get("content-length") ?? "0");

            const alreadyDownloaded =
                fs.existsSync(msixvc) && expectedSize > 0 && fs.statSync(msixvc).size === expectedSize;

            const downloadId = `version-${catalogVersion.uuid}`;
            if (!alreadyDownloaded) {
                useDownloadStore.getState().addDownload({
                    id: downloadId, name: label, type: "version", progress: 0,
                    status: "downloading", abortController: null,
                });
                addPendingDownload({ id: downloadId, name: label, type: "version", url: mirror, versionUuid: catalogVersion.uuid });

                try {
                    await ProgressBar.useAsync(async ({ setStatus, setMessage, setProgress }) => {
                        setStatus("downloading");
                        await Downloader.downloadFile(mirror, msixvc, (transferred, total) => {
                            const progress = total > 0 ? transferred / total : 0;
                            const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
                            setMessage(`Downloading ${label}... (${mb(transferred)}MB / ${mb(total)}MB)`);
                            setProgress(progress);
                            useDownloadStore.getState().updateDownload(downloadId, { progress });
                        });
                    });
                } catch (e) {
                    console.error(`[VersionService] Download of ${label} failed.`, { mirror, msixvc, expectedSize }, e);
                    useDownloadStore.getState().updateDownload(downloadId, { status: "error" });
                    removePendingDownload(downloadId);
                    await fs.promises.rm(msixvc, { force: true }).catch(() => {});
                    throw e;
                }

                const downloadedSize = fs.statSync(msixvc).size;
                if (expectedSize > 0 && downloadedSize !== expectedSize) {
                    await fs.promises.rm(msixvc, { force: true }).catch(() => {});
                    useDownloadStore.getState().updateDownload(downloadId, { status: "error" });
                    removePendingDownload(downloadId);
                    console.error(`[VersionService] ${label} downloaded ${downloadedSize} of ${expectedSize} bytes.`, { mirror, msixvc });
                    throw new Error(
                        `${label} downloaded incompletely (${downloadedSize} of ${expectedSize} bytes). Try again.`
                    );
                }
            }

            useDownloadStore.getState().updateDownload(downloadId, { status: "extracting", progress: 1 });

            try {
                await fs.promises.rm(folder, { recursive: true, force: true });
                await this.decryptAndExtract(msixvc, folder, label);
            } finally {
                await fs.promises.rm(msixvc, { force: true });
            }

            const installed: InstalledVersion = {
                uuid: catalogVersion.uuid,
                label,
                channel: catalogVersion.channel,
                version: catalogVersion.version,
                path: folder,
                packageFamily: readPackageFamily(folder),
                imported: false,
            };
            this.library.add(installed);

            useDownloadStore.getState().updateDownload(downloadId, { status: "done", progress: 1 });
            removePendingDownload(downloadId);

            this.emit("installed", installed);
            return installed;
        });
    }

    /** Installs a user-supplied .msixvc. */
    async importMsixvc(request: ImportRequest): Promise<InstalledVersion> {
        if (!request.file.toLowerCase().endsWith(".msixvc")) {
            throw new Error("Only .msixvc files can be imported.");
        }
        if (!fs.statSync(request.file).isFile()) throw new Error(`"${request.file}" is not a file.`);
        if (this.library.byUuid(request.uuid)) throw new Error(`Version ${request.uuid} is already installed.`);

        const slug = artifactSlug(request.version.toString(), request.channel, request.uuid);
        const { msixvc, folder, lockName } = this.artifactPaths(slug);
        fs.mkdirSync(this.paths.versionsPath, { recursive: true });

        return this.withLock(lockName, request.label, async () => {
            await ProgressBar.useAsync(async ({ setMessage, setProgress }) => {
                setMessage(`Copying ${path.basename(request.file)}...`);
                setProgress(0.5);
                await fs.promises.copyFile(request.file, msixvc);
            }, true, FULL_PROGRESS_RESET_OPTIONS);

            try {
                await fs.promises.rm(folder, { recursive: true, force: true });
                await this.decryptAndExtract(msixvc, folder, request.label);
            } finally {
                await fs.promises.rm(msixvc, { force: true });
            }

            const installed: InstalledVersion = {
                uuid: request.uuid,
                label: request.label,
                channel: request.channel,
                version: request.version,
                path: folder,
                packageFamily: readPackageFamily(folder),
                imported: true,
            };
            this.library.add(installed);
            this.emit("installed", installed);
            return installed;
        });
    }

    async uninstall(uuid: string): Promise<void> {
        const installed = this.library.byUuid(uuid);
        if (!installed) return;

        await ProgressBar.useAsync(async ({ setStatus, setMessage }) => {
            setStatus("deleting");
            setMessage(`Removing ${installed.label}...`);
            await fs.promises.rm(installed.path, { recursive: true, force: true });
            this.library.remove(uuid);
        }, true, FULL_PROGRESS_RESET_OPTIONS);

        this.emit("uninstalled", uuid);
    }

    /** Resolves a profile's version, downloading it if the catalog knows it but disk doesn't. */
    async resolveOrInstall(versionUuid: string): Promise<InstalledVersion> {
        const installed = this.library.byUuid(versionUuid);
        if (installed) return installed;

        await this.catalog.refresh();
        const fromCatalog = this.catalog.byUuid(versionUuid);
        if (!fromCatalog) {
            throw new Error(
                `This profile's Minecraft version (${versionUuid}) isn't installed and isn't in the version database. ` +
                `Pick a different version in the profile editor.`
            );
        }
        return this.install(fromCatalog);
    }
}
