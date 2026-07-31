import { errnoCode } from "@renderer/scripts/Directories";
import { InstalledVersion, deserialize, serialize } from "./InstalledVersion";

const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");

/**
 * The installed-version records. Reads are pure — pruning records whose folder has
 * vanished is an explicit call, so it can never fire from a React render.
 */
export class Library {
    private versions: InstalledVersion[] = [];
    private loaded = false;

    constructor(private readonly versionsPath: string) {}

    private get file(): string {
        return path.join(this.versionsPath, "installed_versions.json");
    }

    /** Nothing installed yet is a real state; an unreadable or malformed file is not. */
    load(): void {
        this.loaded = true;
        if (!fs.existsSync(this.file)) {
            this.versions = [];
            return;
        }

        const parsed = JSON.parse(fs.readFileSync(this.file, "utf-8")) as { versions?: unknown };
        if (!Array.isArray(parsed.versions)) throw new Error(`${this.file}: "versions" must be an array`);

        this.versions = parsed.versions.map((entry, index) => deserialize(entry, `${this.file}[${index}]`));
    }

    private ensureLoaded(): void {
        if (!this.loaded) this.load();
    }

    private save(): void {
        fs.mkdirSync(this.versionsPath, { recursive: true });
        const body = JSON.stringify({ versions: this.versions.map(serialize) }, undefined, 4);
        fs.writeFileSync(this.file, body, "utf-8");
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
        if (this.byUuid(version.uuid)) throw new Error(`Version ${version.uuid} is already installed.`);

        const clash = this.claimsPath(version.path);
        if (clash) {
            throw new Error(
                `"${version.path}" is already used by installed version "${clash.label}" (${clash.uuid}).`
            );
        }

        this.versions.push(version);
        this.save();
    }

    update(uuid: string, patch: Partial<InstalledVersion>): void {
        this.ensureLoaded();
        const index = this.versions.findIndex(v => v.uuid === uuid);
        if (index === -1) return;
        this.versions[index] = { ...this.versions[index], ...patch };
        this.save();
    }

    remove(uuid: string): void {
        this.ensureLoaded();
        const before = this.versions.length;
        this.versions = this.versions.filter(v => v.uuid !== uuid);
        if (this.versions.length !== before) this.save();
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
        console.warn("[Library] Pruned installed versions with missing folders:", uuids);
        return uuids;
    }
}
