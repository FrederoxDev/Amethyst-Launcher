import { SemVersion } from "@renderer/scripts/classes/SemVersion";
import { Channel, channelLabel, isChannel } from "@renderer/scripts/domain/Channel";

const fs = window.require("fs") as typeof import("fs");

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

function deserialize(text: string, where: string): CachedCatalog {
    const o = JSON.parse(text) as Record<string, unknown>;
    if (!Array.isArray(o.versions)) throw new Error(`${where}: "versions" must be an array`);
    if (typeof o.fetched_at !== "string") throw new Error(`${where}: "fetched_at" must be a string`);
    if (typeof o.file_version !== "number") throw new Error(`${where}: "file_version" must be a number`);

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

    return { versions, fetchedAt: new Date(o.fetched_at), fileVersion: o.file_version };
}

async function fetchRemote(): Promise<CachedCatalog> {
    const response = await fetch(DATABASE_URL);
    if (!response.ok) {
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
     * Serves the cache while fresh, refetches when stale. Being offline falls back to a
     * stale cache; a corrupt cache does not — that's a bug, not a network condition.
     */
    async refresh(): Promise<readonly CatalogVersion[]> {
        const onDisk = fs.existsSync(this.cacheFilePath)
            ? deserialize(fs.readFileSync(this.cacheFilePath, "utf-8"), this.cacheFilePath)
            : null;

        if (onDisk && Date.now() - onDisk.fetchedAt.getTime() < REFRESH_INTERVAL_MS) {
            this.cache = onDisk;
            return this.cache.versions;
        }

        try {
            this.cache = await fetchRemote();
            fs.writeFileSync(this.cacheFilePath, serialize(this.cache), "utf-8");
            console.log(`[Catalog] Refreshed: ${this.cache.versions.length} versions`);
        } catch (e) {
            if (!onDisk) throw new Error(`Could not reach the version database and no cache is available. ${e}`);
            console.warn("[Catalog] Refresh failed, using stale cache:", e);
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
