import { describeError } from "@shared/diagnostics/Log";
import { errnoCode } from "@renderer/scripts/Directories";
import { log } from "@renderer/scripts/LauncherLog";
import { inspectStamp, quarantineFile, stampFields, tryReadJsonFile } from "@renderer/scripts/Utility";
import { InstalledVersion, deserialize, serialize } from "./InstalledVersion";

const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");

const FORMAT = "installed-versions";
const FORMAT_VERSION = 1;

/** Plain words for the user, since a quarantine notice reaches them as well as the log. */
const WHAT = "list of installed Minecraft versions";

/**
 * The installed-version records. Reads are pure - pruning records whose folder has
 * vanished is an explicit call, so it can never fire from a React render.
 */
export class Library {
    private versions: InstalledVersion[] = [];
    private loaded = false;

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
        this.versions = [];

        if (!fs.existsSync(this.file)) {
            log("Library", `No installed-version record at ${this.file}, starting with none`);
            return;
        }

        const read = tryReadJsonFile<unknown>("Library", this.file);
        if (!read.ok) {
            quarantineFile("Library", this.file, WHAT, read.reason);
            return;
        }

        const stamp = inspectStamp("Library", this.file, read.value, FORMAT, FORMAT_VERSION);
        if (stamp.state === "mismatch") {
            quarantineFile("Library", this.file, WHAT, stamp.reason);
            return;
        }

        const entries = (read.value as { versions?: unknown } | null)?.versions;
        if (!Array.isArray(entries)) {
            quarantineFile("Library", this.file, WHAT, `"versions" must be an array, not ${typeof entries}`);
            return;
        }

        try {
            this.versions = entries.map((entry, index) => deserialize(entry, `${this.file}[${index}]`));
        } catch (e) {
            this.versions = [];
            log("Library", `An entry in ${this.file} could not be read: ${describeError(e)}`);
            quarantineFile("Library", this.file, WHAT, (e as Error).message ?? String(e));
            return;
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

    private save(): void {
        fs.mkdirSync(this.versionsPath, { recursive: true });
        const body = {
            ...stampFields(FORMAT, FORMAT_VERSION),
            versions: this.versions.map(serialize),
        };
        fs.writeFileSync(this.file, JSON.stringify(body, undefined, 4), "utf-8");
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
