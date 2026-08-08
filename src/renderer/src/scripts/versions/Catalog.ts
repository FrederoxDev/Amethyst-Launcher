import { describeError } from "@shared/diagnostics/Log";
import { SemVersion } from "@renderer/scripts/classes/SemVersion";
import { Channel, channelLabel, isChannel } from "@renderer/scripts/domain/Channel";
import { log } from "@renderer/scripts/LauncherLog";
import { discardCacheFile, inspectStamp, stampFields, tryReadJsonFile } from "@renderer/scripts/Utility";

const fs = window.require("fs") as typeof import("fs");

const FORMAT = "version-catalog-cache";
const FORMAT_VERSION = 1;

const DATABASE_URL =
    "https://raw.githubusercontent.com/LukasPAH/minecraft-windows-gdk-version-db/refs/heads/main/historical_versions.json";

const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

const UUID_PATTERN = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

export interface CatalogVersion {
    uuid: string;
    channel: Channel;
    version: SemVersion;
    urls: string[];
}

export function catalogLabel(v: CatalogVersion): string {
    return `${channelLabel(v.channel)} ${v.version.toString()}`;
}

interface RemoteContract {
    file_version: number;
    previewVersions: { version: string; urls: string[] }[];
    releaseVersions: { version: string; urls: string[] }[];
}

interface CachedCatalog {
    versions: CatalogVersion[];
    fetchedAt: Date;
    fileVersion: number;
}

/** Recovers the msixvc filename's embedded version, e.g. `...WindowsBeta_1.26.5022.0_x64...` -> `26.50.22`. */
export function prettifyVersionFromFilename(name: string): string | null {
    const stripped = name
        .toLowerCase()
        .replace("microsoft.minecraftuwp_", "")
        .replace("microsoft.minecraftwindowsbeta_", "")
        .replace(".0_x64__8wekyb3d8bbwe", "");

    const match = stripped.match(/(\d+)\.(\d+)\.(\d+)$/);
    if (!match) return null;

    const [, major, minor, rawPatch] = match;
    const patch = (parseInt(rawPatch) / 100).toFixed(2);
    // Bedrock switched to calendar versioning at minor 26, dropping the leading 1.
    return parseInt(minor) >= 26 ? `${minor}.${patch}` : `${major}.${minor}.${patch}`;
}

/** Channel a msixvc filename belongs to, or null if the name carries no package identity. */
export function channelFromFilename(name: string): Channel | null {
    const lower = name.toLowerCase();
    if (lower.includes("microsoft.minecraftwindowsbeta_")) return "preview";
    if (lower.includes("microsoft.minecraftuwp_")) return "release";
    return null;
}

function serialize(cache: CachedCatalog): string {
    return JSON.stringify({
        ...stampFields(FORMAT, FORMAT_VERSION),
        versions: cache.versions.map(v => ({
            uuid: v.uuid,
            channel: v.channel,
            version: v.version.toString(),
            urls: v.urls,
        })),
        fetched_at: cache.fetchedAt.toISOString(),
        file_version: cache.fileVersion,
    }, undefined, 4);
}

function deserialize(o: Record<string, unknown>, where: string): CachedCatalog {
    if (!Array.isArray(o.versions)) throw new Error(`"versions" must be an array, not ${typeof o.versions}`);
    if (typeof o.fetched_at !== "string") throw new Error(`"fetched_at" must be a string, not ${typeof o.fetched_at}`);
    if (typeof o.file_version !== "number") throw new Error(`"file_version" must be a number, not ${typeof o.file_version}`);

    const versions = o.versions.map((raw, index) => {
        const e = raw as Record<string, unknown>;
        const at = `${where}[${index}]`;
        if (typeof e.uuid !== "string" || e.uuid === "") throw new Error(`${at}: "uuid" must be a non-empty string`);
        if (typeof e.version !== "string") throw new Error(`${at}: "version" must be a string`);
        if (!isChannel(e.channel)) throw new Error(`${at}: "channel" must be "release" or "preview"`);
        if (!Array.isArray(e.urls) || !e.urls.every(u => typeof u === "string")) {
            throw new Error(`${at}: "urls" must be an array of strings`);
        }
        return { uuid: e.uuid, channel: e.channel, version: SemVersion.fromString(e.version), urls: e.urls as string[] };
    });

    const fetchedAt = new Date(o.fetched_at);
    if (Number.isNaN(fetchedAt.getTime())) throw new Error(`"fetched_at" is not a date: "${o.fetched_at}"`);

    return { versions, fetchedAt, fileVersion: o.file_version };
}

async function fetchRemote(): Promise<CachedCatalog> {
    log("Catalog", `Fetching the version database from ${DATABASE_URL}`);
    const response = await fetch(DATABASE_URL);
    if (!response.ok) {
        log("Catalog", `Version database returned ${response.status} ${response.statusText}`);
        throw new Error(`Version database returned ${response.status} ${response.statusText}`);
    }
    const data = await response.json() as RemoteContract;

    const build = (entries: { version: string; urls: string[] }[], channel: Channel): CatalogVersion[] =>
        entries.map(e => {
            const uuid = e.urls[0]?.match(UUID_PATTERN)?.at(-1);
            if (!uuid) throw new Error(`Version database entry "${e.version}" has no UUID in its download URL`);
            return {
                uuid,
                channel,
                version: SemVersion.fromString(e.version.replace("Release ", "").replace("Preview ", "")),
                urls: e.urls,
            };
        });

    return {
        versions: [...build(data.releaseVersions, "release"), ...build(data.previewVersions, "preview")],
        fetchedAt: new Date(),
        fileVersion: data.file_version,
    };
}

export class Catalog {
    private cache: CachedCatalog = { versions: [], fetchedAt: new Date(0), fileVersion: -1 };

    constructor(private readonly cacheFilePath: string) {}

    /**
     * The cache is disposable: it can always be fetched again, so a file this build cannot read
     * is deleted and treated as a cache miss rather than reported to the user. Being offline
     * with a stale but readable cache still falls back to that cache.
     */
    private readCache(): CachedCatalog | null {
        if (!fs.existsSync(this.cacheFilePath)) {
            log("Catalog", `No cached version list at ${this.cacheFilePath}`);
            return null;
        }

        const read = tryReadJsonFile<unknown>("Catalog", this.cacheFilePath);
        if (!read.ok) {
            discardCacheFile("Catalog", this.cacheFilePath, read.reason);
            return null;
        }

        const stamp = inspectStamp("Catalog", this.cacheFilePath, read.value, FORMAT, FORMAT_VERSION);
        if (stamp.state === "mismatch") {
            discardCacheFile("Catalog", this.cacheFilePath, stamp.reason);
            return null;
        }
        if (stamp.state === "legacy") {
            // Unstamped means an older launcher wrote it, and that is exactly the drift that
            // used to dead-end the version list. It costs one fetch to be certain.
            discardCacheFile("Catalog", this.cacheFilePath, "it carries no format stamp, so an older launcher build wrote it");
            return null;
        }

        if (typeof read.value !== "object" || read.value === null || Array.isArray(read.value)) {
            discardCacheFile("Catalog", this.cacheFilePath, "it does not hold a JSON object");
            return null;
        }

        try {
            return deserialize(read.value as Record<string, unknown>, this.cacheFilePath);
        } catch (e) {
            discardCacheFile("Catalog", this.cacheFilePath, (e as Error).message);
            return null;
        }
    }

    async refresh(): Promise<readonly CatalogVersion[]> {
        const onDisk = this.readCache();

        if (onDisk) {
            const ageMinutes = (Date.now() - onDisk.fetchedAt.getTime()) / 60000;
            if (ageMinutes * 60000 < REFRESH_INTERVAL_MS) {
                this.cache = onDisk;
                log(
                    "Catalog",
                    `Serving the cached list of ${onDisk.versions.length} versions, fetched ${ageMinutes.toFixed(1)} `
                    + `minutes ago, under the ${REFRESH_INTERVAL_MS / 60000} minute refresh interval`
                );
                return this.cache.versions;
            }
            log("Catalog", `Cached list is ${ageMinutes.toFixed(1)} minutes old, refetching`);
        }

        try {
            this.cache = await fetchRemote();
            // Caching is best effort: a fetched list that could not be written is still a
            // fetched list, and failing here would be reported as an unreachable database.
            try {
                fs.writeFileSync(this.cacheFilePath, serialize(this.cache), "utf-8");
                log("Catalog", `Refreshed: ${this.cache.versions.length} versions cached to ${this.cacheFilePath}`);
            } catch (writeError) {
                log(
                    "Catalog",
                    `Refreshed ${this.cache.versions.length} versions but could not write `
                    + `${this.cacheFilePath}: ${describeError(writeError)}`
                );
            }
        } catch (e) {
            if (!onDisk) {
                log("Catalog", `Refresh failed and no cache exists at ${this.cacheFilePath}: ${describeError(e)}`);
                throw new Error(`Could not reach the version database and no cache is available. ${e}`);
            }
            log(
                "Catalog",
                `Refresh failed, falling back to the ${onDisk.versions.length}-version cache fetched `
                + `${onDisk.fetchedAt.toISOString()}: ${describeError(e)}`
            );
            this.cache = onDisk;
        }

        return this.cache.versions;
    }

    all(): readonly CatalogVersion[] {
        return this.cache.versions;
    }

    byUuid(uuid: string): CatalogVersion | null {
        return this.cache.versions.find(v => v.uuid === uuid) ?? null;
    }

    latest(channel: Channel): CatalogVersion | null {
        return this.cache.versions
            .filter(v => v.channel === channel)
            .reduce<CatalogVersion | null>((best, v) => (best === null || compare(v, best) > 0 ? v : best), null);
    }
}

function compare(a: CatalogVersion, b: CatalogVersion): number {
    return (a.version.major - b.version.major)
        || (a.version.minor - b.version.minor)
        || (a.version.patch - b.version.patch)
        || (a.version.build - b.version.build);
}
