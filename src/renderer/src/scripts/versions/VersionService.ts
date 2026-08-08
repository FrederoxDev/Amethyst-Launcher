import { describeError } from "@shared/diagnostics/Log";
import { SemVersion } from "@renderer/scripts/classes/SemVersion";
import { Channel } from "@renderer/scripts/domain/Channel";
import { errnoCode } from "@renderer/scripts/Directories";
import { FileLocker } from "@renderer/scripts/FileLocker";
import { log } from "@renderer/scripts/LauncherLog";
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

function mb(bytes: number): string {
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/** The appx family a build registers as, read from the build itself. */
function readPackageFamily(versionPath: string): string {
    const manifest = path.join(versionPath, "appxmanifest.xml");
    const family = fs.readFileSync(manifest, "utf-8").match(/<Identity\s+Name="([^"]+)"/)?.[1];
    if (!family) throw new Error(`${manifest}: no <Identity Name>`);
    log("Versions", `${manifest} declares package family ${family}`);
    return family;
}

async function fastestMirror(urls: string[]): Promise<string> {
    const probes = await Promise.all(urls.map(async url => {
        const start = performance.now();
        try {
            const response = await fetch(url, { method: "HEAD" });
            if (!response.ok) {
                log("Versions", `Mirror ${url} answered ${response.status} ${response.statusText}, skipping it`);
                return null;
            }
            return { url, ms: performance.now() - start, size: parseInt(response.headers.get("content-length") ?? "0") };
        } catch (e) {
            log("Versions", `Mirror ${url} did not answer: ${describeError(e)}`);
            return null;
        }
    }));

    const live = probes.filter((p): p is { url: string; ms: number; size: number } => p !== null);
    if (live.length === 0) {
        log("Versions", `No mirror answered out of ${urls.length}: ${urls.join(", ")}`);
        throw new Error(`No download mirror responded (tried ${urls.length}).`);
    }
    live.sort((a, b) => a.ms - b.ms);
    log(
        "Versions",
        `Picked mirror ${live[0].url} at ${live[0].ms.toFixed(0)}ms, ${mb(live[0].size)}; `
        + `${live.length} of ${urls.length} mirrors answered`
    );
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

    /** Size of a file that is about to be deleted, so the log records what was lost. */
    private static async sizeOf(target: string): Promise<string> {
        try {
            return mb((await fs.promises.stat(target)).size);
        } catch {
            return "absent";
        }
    }

    /** Clears locks and partial downloads left by a session that didn't exit cleanly. */
    async cleanupStaleLocks(): Promise<void> {
        let entries: string[];
        try {
            entries = await fs.promises.readdir(this.paths.versionsPath);
        } catch (e) {
            if (errnoCode(e) === "ENOENT") {
                log("Versions", `Stale lock sweep skipped: ${this.paths.versionsPath} does not exist yet`);
                return;
            }
            throw e;
        }

        const locks = entries.filter(entry => entry.endsWith(".lock"));
        if (locks.length === 0) {
            log("Versions", `Stale lock sweep found no .lock files in ${this.paths.versionsPath}`);
            return;
        }
        log("Versions", `Stale lock sweep found ${locks.length} lock file(s): ${locks.join(", ")}`);

        const locker = FileLocker.get();
        for (const entry of locks) {
            const lockPath = path.join(this.paths.versionsPath, entry);
            const basePath = lockPath.replace(/\.lock$/, "");
            if (locker.isLocked(basePath)) {
                log("Versions", `Keeping ${entry}: this run holds that lock`);
                continue;
            }

            const partPath = basePath + PART_SUFFIX;
            const partSize = await VersionService.sizeOf(partPath);
            await fs.promises.rm(lockPath, { force: true });
            await fs.promises.rm(partPath, { force: true });
            if (partSize !== "absent") {
                log("Versions", `Deleted partial download ${partPath} (${partSize}) left by an earlier run`);
            }

            try {
                if ((await fs.promises.stat(basePath)).isFile()) {
                    const size = await VersionService.sizeOf(basePath);
                    await fs.promises.rm(basePath, { force: true });
                    log("Versions", `Deleted unfinished artifact ${basePath} (${size}) left by an earlier run`);
                }
            } catch (e) {
                if (errnoCode(e) !== "ENOENT") throw e;
            }
            log("Versions", `Cleared stale lock ${lockPath}`);
        }
    }

    private async withLock<T>(lockName: string, label: string, body: () => Promise<T>): Promise<T> {
        const lockPath = path.join(this.paths.versionsPath, lockName);
        if (FileLocker.get().isLocked(lockPath)) {
            log("Versions", `Refusing to work on ${label}: ${lockPath} is held by this run already`);
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
            log("Versions", `Decrypting ${msixvc} (${await VersionService.sizeOf(msixvc)}) for ${label}`);
            await LauncherTools.XVDTool.decryptFile(msixvc, CIK_KEYS, false);

            setStatus("extracting");
            setMessage(`Extracting ${label}...`);
            setProgress(0);
            log("Versions", `Extracting ${msixvc} into ${folder}`);
            const error = await LauncherTools.XVDTool.extractFile(msixvc, folder, false);
            if (error) {
                log("Versions", `Extraction of ${label} into ${folder} failed: ${error}`);
                throw new Error(`Could not extract ${label} (${error})`);
            }
            log("Versions", `Extracted ${label} into ${folder}`);
        });
    }

    /** Downloads, extracts and registers a catalog version. Resolves to the installed record. */
    async install(catalogVersion: CatalogVersion): Promise<InstalledVersion> {
        const existing = this.library.byUuid(catalogVersion.uuid);
        if (existing) {
            log(
                "Versions",
                `Install of ${catalogLabel(catalogVersion)} skipped: ${catalogVersion.uuid} is already installed `
                + `at ${existing.path}`
            );
            return existing;
        }

        const label = catalogLabel(catalogVersion);
        const slug = artifactSlug(catalogVersion.version.toString(), catalogVersion.channel, catalogVersion.uuid);
        const { msixvc, folder, lockName } = this.artifactPaths(slug);

        log("Versions", `Installing ${label} (${catalogVersion.uuid}) into ${folder} from ${catalogVersion.urls.length} mirror(s)`);
        fs.mkdirSync(this.paths.versionsPath, { recursive: true });

        return this.withLock(lockName, label, async () => {
            const mirror = await fastestMirror(catalogVersion.urls);
            const head = await fetch(mirror, { method: "HEAD" });
            if (!head.ok) {
                log("Versions", `HEAD on the chosen mirror ${mirror} returned ${head.status} ${head.statusText}`);
                throw new Error(`Download mirror returned ${head.status} for ${label}`);
            }
            const expectedSize = parseInt(head.headers.get("content-length") ?? "0");

            const onDiskSize = fs.existsSync(msixvc) ? fs.statSync(msixvc).size : -1;
            const alreadyDownloaded = onDiskSize >= 0 && expectedSize > 0 && onDiskSize === expectedSize;
            log(
                "Versions",
                `${msixvc}: ${onDiskSize < 0 ? "not on disk" : `${mb(onDiskSize)} on disk`}, `
                + `mirror reports ${expectedSize > 0 ? mb(expectedSize) : "no content-length"}, `
                + `so ${alreadyDownloaded ? "reusing the existing file" : "downloading it"}`
            );

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
                            setMessage(`Downloading ${label}... (${mb(transferred)} / ${mb(total)})`);
                            setProgress(progress);
                            useDownloadStore.getState().updateDownload(downloadId, { progress });
                        });
                    });
                } catch (e) {
                    log(
                        "Versions",
                        `Download of ${label} from ${mirror} failed after expecting ${mb(expectedSize)}; `
                        + `deleting ${msixvc}: ${describeError(e)}`
                    );
                    useDownloadStore.getState().updateDownload(downloadId, { status: "error" });
                    removePendingDownload(downloadId);
                    await fs.promises.rm(msixvc, { force: true }).catch(cleanupError => {
                        log("Versions", `Could not delete the failed download ${msixvc}: ${describeError(cleanupError)}`);
                    });
                    throw e;
                }

                const downloadedSize = fs.statSync(msixvc).size;
                if (expectedSize > 0 && downloadedSize !== expectedSize) {
                    log(
                        "Versions",
                        `${label} downloaded ${downloadedSize} of ${expectedSize} bytes from ${mirror}; `
                        + `deleting the short file ${msixvc}`
                    );
                    await fs.promises.rm(msixvc, { force: true }).catch(cleanupError => {
                        log("Versions", `Could not delete the short download ${msixvc}: ${describeError(cleanupError)}`);
                    });
                    useDownloadStore.getState().updateDownload(downloadId, { status: "error" });
                    removePendingDownload(downloadId);
                    throw new Error(
                        `${label} downloaded incompletely (${downloadedSize} of ${expectedSize} bytes). Try again.`
                    );
                }
                log("Versions", `Downloaded ${label} to ${msixvc} (${mb(downloadedSize)})`);
            }

            useDownloadStore.getState().updateDownload(downloadId, { status: "extracting", progress: 1 });

            try {
                log("Versions", `Clearing ${folder} before extracting ${label}`);
                await fs.promises.rm(folder, { recursive: true, force: true });
                await this.decryptAndExtract(msixvc, folder, label);
            } finally {
                await fs.promises.rm(msixvc, { force: true });
                log("Versions", `Removed the intermediate archive ${msixvc}`);
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

            log("Versions", `Installed ${label} (${installed.uuid}) at ${installed.path}, family ${installed.packageFamily}`);
            this.emit("installed", installed);
            return installed;
        });
    }

    /** Installs a user-supplied .msixvc. */
    async importMsixvc(request: ImportRequest): Promise<InstalledVersion> {
        log(
            "Versions",
            `Import requested: "${request.label}" ${request.version.toString()} ${request.channel} `
            + `(${request.uuid}) from ${request.file}`
        );

        if (!request.file.toLowerCase().endsWith(".msixvc")) {
            log("Versions", `Import rejected: ${request.file} is not a .msixvc`);
            throw new Error("Only .msixvc files can be imported.");
        }
        if (!fs.statSync(request.file).isFile()) {
            log("Versions", `Import rejected: ${request.file} is not a file`);
            throw new Error(`"${request.file}" is not a file.`);
        }
        const clash = this.library.byUuid(request.uuid);
        if (clash) {
            log("Versions", `Import rejected: ${request.uuid} is already installed as "${clash.label}" at ${clash.path}`);
            throw new Error(`Version ${request.uuid} is already installed.`);
        }

        const slug = artifactSlug(request.version.toString(), request.channel, request.uuid);
        const { msixvc, folder, lockName } = this.artifactPaths(slug);
        fs.mkdirSync(this.paths.versionsPath, { recursive: true });

        return this.withLock(lockName, request.label, async () => {
            await ProgressBar.useAsync(async ({ setMessage, setProgress }) => {
                setMessage(`Copying ${path.basename(request.file)}...`);
                setProgress(0.5);
                log("Versions", `Copying ${request.file} (${await VersionService.sizeOf(request.file)}) to ${msixvc}`);
                await fs.promises.copyFile(request.file, msixvc);
            }, true, FULL_PROGRESS_RESET_OPTIONS);

            try {
                log("Versions", `Clearing ${folder} before extracting "${request.label}"`);
                await fs.promises.rm(folder, { recursive: true, force: true });
                await this.decryptAndExtract(msixvc, folder, request.label);
            } finally {
                await fs.promises.rm(msixvc, { force: true });
                log("Versions", `Removed the intermediate archive ${msixvc}`);
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
            log(
                "Versions",
                `Imported "${installed.label}" (${installed.uuid}) to ${installed.path}, family ${installed.packageFamily}`
            );
            this.emit("installed", installed);
            return installed;
        });
    }

    async uninstall(uuid: string): Promise<void> {
        const installed = this.library.byUuid(uuid);
        if (!installed) {
            log("Versions", `Uninstall of ${uuid} skipped: no installed version carries that id`);
            return;
        }

        log("Versions", `Uninstalling "${installed.label}" (${uuid}), deleting ${installed.path}`);
        await ProgressBar.useAsync(async ({ setStatus, setMessage }) => {
            setStatus("deleting");
            setMessage(`Removing ${installed.label}...`);
            await fs.promises.rm(installed.path, { recursive: true, force: true });
            this.library.remove(uuid);
        }, true, FULL_PROGRESS_RESET_OPTIONS);

        log("Versions", `Uninstalled "${installed.label}" (${uuid})`);
        this.emit("uninstalled", uuid);
    }

    /** Resolves a profile's version, downloading it if the catalog knows it but disk doesn't. */
    async resolveOrInstall(versionUuid: string): Promise<InstalledVersion> {
        const installed = this.library.byUuid(versionUuid);
        if (installed) {
            log("Versions", `${versionUuid} resolves to the installed "${installed.label}" at ${installed.path}`);
            return installed;
        }

        log("Versions", `${versionUuid} is not installed, asking the version database for it`);
        await this.catalog.refresh();
        const fromCatalog = this.catalog.byUuid(versionUuid);
        if (!fromCatalog) {
            log(
                "Versions",
                `${versionUuid} is in neither the library nor the version database `
                + `(${this.catalog.all().length} catalog entries known)`
            );
            throw new Error(
                `This profile's Minecraft version (${versionUuid}) isn't installed and isn't in the version database. ` +
                `Pick a different version in the profile editor.`
            );
        }
        return this.install(fromCatalog);
    }
}
