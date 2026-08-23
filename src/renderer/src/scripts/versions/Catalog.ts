import { describeError, userMessage } from "@shared/diagnostics/Log";
import { SemVersion } from "@renderer/scripts/classes/SemVersion";
import { Channel, channelLabel, isChannel } from "@renderer/scripts/domain/Channel";
import { log } from "@renderer/scripts/LauncherLog";
import { discardCacheFile, inspectStamp, stampFields, tryReadJsonFile, writeJsonAtomic } from "@renderer/scripts/Utility";

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

/**
 * A refresh either never arrived or arrived unreadable, and the user can only act on the first
 * of those, so the two are never worded the same.
 */
class CatalogFetchError extends Error {
    constructor(readonly kind: "unreachable" | "malformed", message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "CatalogFetchError";
    }
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

function serialize(cache: CachedCatalog): unknown {
    return {
        ...stampFields(FORMAT, FORMAT_VERSION),
        versions: cache.versions.map(v => ({
            uuid: v.uuid,
            channel: v.channel,
            version: v.version.toString(),
            urls: v.urls,
        })),
        fetched_at: cache.fetchedAt.toISOString(),
        file_version: cache.fileVersion,
    };
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

/** One unusable upstream entry is one version the user cannot download, not a refresh that failed. */
function buildRemote(raw: unknown, channel: Channel, field: string): CatalogVersion[] {
    if (!Array.isArray(raw)) {
        throw new CatalogFetchError("malformed", `"${field}" must be an array, not ${typeof raw}`);
    }

    const versions: CatalogVersion[] = [];
    const skipped: string[] = [];

    raw.forEach((entry, index) => {
        const at = `${field}[${index}]`;
        const e = entry as Record<string, unknown> | null | undefined;

        if (typeof e?.version !== "string") {
            skipped.push(`${at}: "version" must be a string, not ${typeof e?.version}`);
            return;
        }
        if (!Array.isArray(e.urls) || !e.urls.every(u => typeof u === "string")) {
            skipped.push(`${at} ("${e.version}"): "urls" must be an array of strings`);
            return;
        }

        const urls = e.urls as string[];
        const uuid = urls[0]?.match(UUID_PATTERN)?.at(-1);
        if (!uuid) {
            skipped.push(`${at} ("${e.version}"): no UUID in its download URL`);
            return;
        }

        try {
            versions.push({
                uuid,
                channel,
                version: SemVersion.fromString(e.version.replace("Release ", "").replace("Preview ", "")),
                urls,
            });
        } catch (parseError) {
            skipped.push(`${at}: ${userMessage(parseError)}`);
        }
    });

    if (skipped.length > 0) {
        log("Catalog", `Skipped ${skipped.length} unusable ${field} entries: ${skipped.join("; ")}`);
    }
    return versions;
}

async function fetchRemote(): Promise<CachedCatalog> {
    log("Catalog", `Fetching the version database from ${DATABASE_URL}`);

    let response: Response;
    try {
        response = await fetch(DATABASE_URL);
    } catch (e) {
        log("Catalog", `${DATABASE_URL} could not be reached: ${describeError(e)}`);
        throw new CatalogFetchError("unreachable", `${DATABASE_URL} could not be reached`, { cause: e });
    }

    if (!response.ok) {
        log("Catalog", `Version database returned ${response.status} ${response.statusText}`);
        throw new CatalogFetchError("unreachable", `Version database returned ${response.status} ${response.statusText}`);
    }

    let data: Record<string, unknown>;
    try {
        data = await response.json() as Record<string, unknown>;
    } catch (e) {
        log("Catalog", `${DATABASE_URL} did not return JSON: ${describeError(e)}`);
        throw new CatalogFetchError("malformed", "the version database is not valid JSON", { cause: e });
    }

    if (typeof data !== "object" || data === null || Array.isArray(data)) {
        throw new CatalogFetchError("malformed", `the version database is a ${Array.isArray(data) ? "array" : typeof data}, not an object`);
    }

    if (typeof data.file_version !== "number") {
        log("Catalog", `Version database has no numeric "file_version" (${typeof data.file_version}), recording -1`);
    }

    return {
        versions: [
            ...buildRemote(data.releaseVersions, "release", "releaseVersions"),
            ...buildRemote(data.previewVersions, "preview", "previewVersions"),
        ],
        fetchedAt: new Date(),
        fileVersion: typeof data.file_version === "number" ? data.file_version : -1,
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
            discardCacheFile("Catalog", this.cacheFilePath, userMessage(e));
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
                writeJsonAtomic(this.cacheFilePath, serialize(this.cache));
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
                const malformed = e instanceof CatalogFetchError && e.kind === "malformed";
                throw new Error(
                    malformed
                        ? `The version list was downloaded but could not be read (${userMessage(e)}), and no cache is available.`
                        : `Could not reach the version database (${userMessage(e)}), and no cache is available. Check your internet connection and try again.`,
                    { cause: e }
                );
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
