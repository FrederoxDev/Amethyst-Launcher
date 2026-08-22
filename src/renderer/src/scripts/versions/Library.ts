import { describeError, userMessage } from "@shared/diagnostics/Log";
import { SemVersion } from "@renderer/scripts/classes/SemVersion";
import { errnoCode } from "@renderer/scripts/Directories";
import { Channel, channelLabel, parseChannel } from "@renderer/scripts/domain/Channel";
import { log } from "@renderer/scripts/LauncherLog";
import { inspectStamp, quarantineFile, stampFields, tryReadJsonFile, writeJsonAtomic } from "@renderer/scripts/Utility";
import { InstalledVersion, deserialize, serialize } from "./InstalledVersion";

const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");

const FORMAT = "installed-versions";
const FORMAT_VERSION = 1;

/** Plain words for the user, since a quarantine notice reaches them as well as the log. */
const WHAT = "list of installed Minecraft versions";

/** The appx identity of each channel, for a migrated folder whose manifest cannot be read. */
const FAMILY_BY_CHANNEL: Record<Channel, string> = {
    release: "Microsoft.MinecraftUWP",
    preview: "Microsoft.MinecraftWindowsBeta",
};

const VERSION_IN_TEXT = /\d+\.\d+\.\d+(?:\.\d+)?/;

/** Records from before labels, versions and channels were kept: `{uuid, name, path, type, imported, installed_from}`. */
function isLegacyEntry(raw: unknown): raw is Record<string, unknown> {
    if (typeof raw !== "object" || raw === null) return false;
    const o = raw as Record<string, unknown>;
    return o.label === undefined && typeof o.uuid === "string" && typeof o.name === "string" && typeof o.path === "string";
}

function packageFamilyOf(versionPath: string, channel: Channel): string {
    const manifest = path.join(versionPath, "appxmanifest.xml");
    try {
        const family = fs.readFileSync(manifest, "utf-8").match(/<Identity\s+Name="([^"]+)"/)?.[1];
        if (family) return family;
        log("Library", `${manifest} has no <Identity Name>, assuming ${FAMILY_BY_CHANNEL[channel]}`);
    } catch (e) {
        log("Library", `Could not read ${manifest} (${describeError(e)}), assuming ${FAMILY_BY_CHANNEL[channel]}`);
    }
    return FAMILY_BY_CHANNEL[channel];
}

/**
 * Rebuilds the fields the old format never held out of the ones it did. The folder these point
 * at holds a game download, so a record that is only partly recoverable still beats no record.
 */
function migrateLegacyEntry(o: Record<string, unknown>, where: string): InstalledVersion {
    const name = o.name as string;
    const versionPath = o.path as string;

    const channel = parseChannel(o.type)
        ?? (/preview|beta/i.test(`${name} ${versionPath}`) ? "preview" : "release");

    const found = `${name} ${path.basename(versionPath)}`.match(VERSION_IN_TEXT)?.[0];
    const version = found ? SemVersion.fromString(found) : new SemVersion(0, 0, 0, 0);

    const migrated: InstalledVersion = {
        uuid: o.uuid as string,
        label: name || `Minecraft ${version.toString()} (${channelLabel(channel)})`,
        channel,
        version,
        path: versionPath,
        packageFamily: packageFamilyOf(versionPath, channel),
        imported: o.imported === true,
    };

    log(
        "Library",
        `Migrated ${where} from the old format: "${migrated.label}" (${migrated.uuid}) at ${migrated.path}, `
        + `channel ${migrated.channel} from type=${String(o.type)}, version ${migrated.version.toString()}`
        + `${found ? "" : " which no name or folder in the record carried"}, family ${migrated.packageFamily}`
    );
    return migrated;
}

/**
 * The installed-version records. Reads are pure - pruning records whose folder has
 * vanished is an explicit call, so it can never fire from a React render.
 */
export class Library {
    private versions: InstalledVersion[] = [];
    private loaded = false;
    private sealed = false;

    constructor(private readonly versionsPath: string) {}

    private get file(): string {
        return path.join(this.versionsPath, "installed_versions.json");
    }

    /**
     * This record points at multi-gigabyte folders the user downloaded, so a file this build
     * cannot read is moved aside rather than deleted. The launcher then behaves as if nothing
     * is installed and the folders stay where they are.
     */
    load(): void {
        this.loaded = true;
        this.sealed = false;
        this.versions = [];

        if (!fs.existsSync(this.file)) {
            log("Library", `No installed-version record at ${this.file}, starting with none`);
            return;
        }

        const read = tryReadJsonFile<unknown>("Library", this.file);
        if (!read.ok) return this.reject(read.reason);

        const stamp = inspectStamp("Library", this.file, read.value, FORMAT, FORMAT_VERSION);
        if (stamp.state === "mismatch") return this.reject(stamp.reason);

        const entries = (read.value as { versions?: unknown } | null)?.versions;
        if (!Array.isArray(entries)) {
            return this.reject(`"versions" must be an array, not ${typeof entries}`);
        }

        let migrated = 0;
        try {
            this.versions = entries.map((entry, index) => {
                const where = `${this.file}[${index}]`;
                if (!isLegacyEntry(entry)) return deserialize(entry, where);
                migrated++;
                return migrateLegacyEntry(entry, where);
            });
        } catch (e) {
            this.versions = [];
            log("Library", `An entry in ${this.file} could not be read: ${describeError(e)}`);
            return this.reject(userMessage(e));
        }

        if (migrated > 0) {
            try {
                this.save();
                log("Library", `Rewrote ${this.file} with ${migrated} of ${this.versions.length} record(s) migrated from the old format`);
            } catch (e) {
                log("Library", `Migrated ${migrated} record(s) but could not rewrite ${this.file}: ${describeError(e)}`);
            }
        }

        log(
            "Library",
            `Loaded ${this.versions.length} installed version(s) from ${this.file}`
            + `${stamp.state === "legacy" ? " as an unstamped file, it gets a stamp on the next save" : ""}: `
            + `${this.versions.map(v => `"${v.label}" (${v.uuid}) at ${v.path}`).join("; ") || "none"}`
        );
    }

    private ensureLoaded(): void {
        if (!this.loaded) this.load();
    }

    /**
     * A record that could not be read and could not be moved aside is the only trace of where
     * the user's installed builds are, so it is left alone rather than rewritten from nothing.
     */
    private reject(reason: string): void {
        if (!quarantineFile("Library", this.file, WHAT, reason)) this.sealed = true;
    }

    private save(): void {
        if (this.sealed) {
            log("Library", `REFUSING to write ${this.file}: it could not be read and could not be moved aside`);
            return;
        }
        fs.mkdirSync(this.versionsPath, { recursive: true });
        writeJsonAtomic(this.file, {
            ...stampFields(FORMAT, FORMAT_VERSION),
            versions: this.versions.map(serialize),
        });
    }

    list(): readonly InstalledVersion[] {
        this.ensureLoaded();
        return this.versions;
    }

    byUuid(uuid: string): InstalledVersion | null {
        this.ensureLoaded();
        return this.versions.find(v => v.uuid === uuid) ?? null;
    }

    claimsPath(candidate: string): InstalledVersion | null {
        this.ensureLoaded();
        const wanted = path.resolve(candidate).toLowerCase();
        return this.versions.find(v => path.resolve(v.path).toLowerCase() === wanted) ?? null;
    }

    add(version: InstalledVersion): void {
        this.ensureLoaded();
        if (this.byUuid(version.uuid)) {
            log("Library", `Refusing to record ${version.uuid} twice; "${version.label}" is already in ${this.file}`);
            throw new Error(`Version ${version.uuid} is already installed.`);
        }

        const clash = this.claimsPath(version.path);
        if (clash) {
            log("Library", `Refusing to record "${version.label}" at ${version.path}: "${clash.label}" (${clash.uuid}) already claims it`);
            throw new Error(
                `"${version.path}" is already used by installed version "${clash.label}" (${clash.uuid}).`
            );
        }

        this.versions.push(version);
        this.save();
        log("Library", `Recorded "${version.label}" (${version.uuid}) at ${version.path}; ${this.versions.length} installed`);
    }

    update(uuid: string, patch: Partial<InstalledVersion>): void {
        this.ensureLoaded();
        const index = this.versions.findIndex(v => v.uuid === uuid);
        if (index === -1) {
            log("Library", `Update of ${uuid} did nothing: no record with that id in ${this.file}`);
            return;
        }
        this.versions[index] = { ...this.versions[index], ...patch };
        this.save();
        log("Library", `Updated ${uuid} with ${JSON.stringify(patch)}`);
    }

    remove(uuid: string): void {
        this.ensureLoaded();
        const before = this.versions.length;
        this.versions = this.versions.filter(v => v.uuid !== uuid);
        if (this.versions.length !== before) {
            this.save();
            log("Library", `Dropped ${uuid} from ${this.file}; ${this.versions.length} installed`);
            return;
        }
        log("Library", `Remove of ${uuid} did nothing: no record with that id in ${this.file}`);
    }

    /** Drops records whose folder is gone. Returns the uuids removed. */
    prune(): string[] {
        this.ensureLoaded();
        const missing = this.versions.filter(v => {
            try {
                return !fs.statSync(v.path).isDirectory();
            } catch (e) {
                if (errnoCode(e) === "ENOENT") return true;
                throw e;
            }
        });
        if (missing.length === 0) return [];

        const uuids = missing.map(v => v.uuid);
        this.versions = this.versions.filter(v => !uuids.includes(v.uuid));
        this.save();
        log(
            "Library",
            `Pruned ${missing.length} installed version(s) whose folder is gone: `
            + `${missing.map(v => `"${v.label}" (${v.uuid}) at ${v.path}`).join("; ")}`
        );
        return uuids;
    }
}
