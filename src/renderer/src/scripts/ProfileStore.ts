import { describeError } from "@shared/diagnostics/Log";
import { log } from "./LauncherLog";
import { inspectStamp, quarantineFile, stampFields, tryReadJsonFile } from "./Utility";
import { Profile, parseProfile } from "./domain/Profile";

const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");

const FORMAT = "launcher-profiles";
const FORMAT_VERSION = 1;

const WHAT = "profiles";

interface StampedProfiles {
    profiles?: unknown;
}

export class ProfileStore {
    constructor(private readonly filePath: string) {}

    /**
     * Profiles are the user's own work, so a file this build cannot read is moved aside rather
     * than deleted, and the launcher starts with none.
     */
    load(): Profile[] {
        if (!fs.existsSync(this.filePath)) {
            log("Profiles", `No profiles file at ${this.filePath}, starting with none`);
            return [];
        }

        const read = tryReadJsonFile<unknown>("Profiles", this.filePath);
        if (!read.ok) {
            quarantineFile("Profiles", this.filePath, WHAT, read.reason);
            return [];
        }

        const stamp = inspectStamp("Profiles", this.filePath, read.value, FORMAT, FORMAT_VERSION);
        if (stamp.state === "mismatch") {
            quarantineFile("Profiles", this.filePath, WHAT, stamp.reason);
            return [];
        }

        // Before stamping, the file was a bare array. Anything else unstamped is not ours.
        const entries = stamp.state === "legacy"
            ? read.value
            : (read.value as StampedProfiles).profiles;

        if (!Array.isArray(entries)) {
            quarantineFile(
                "Profiles",
                this.filePath,
                WHAT,
                stamp.state === "legacy"
                    ? "an unstamped profiles file has to be an array of profiles and this one is not"
                    : `"profiles" must be an array, not ${typeof entries}`
            );
            return [];
        }

        let profiles: Profile[];
        try {
            profiles = entries.map((entry, index) => parseProfile(entry, `${this.filePath}[${index}]`));
        } catch (e) {
            log("Profiles", `A profile in ${this.filePath} could not be read: ${describeError(e)}`);
            quarantineFile("Profiles", this.filePath, WHAT, (e as Error).message ?? String(e));
            return [];
        }

        log(
            "Profiles",
            `Loaded ${profiles.length} profile(s) from ${this.filePath}`
            + `${stamp.state === "legacy" ? " as an unstamped file, it gets a stamp on the next save" : ""}: `
            + `${profiles.map(p => `"${p.name}" (${p.uuid}, ${p.channel}, ${p.mods.length} mods)`).join("; ") || "none"}`
        );
        return profiles;
    }

    save(profiles: Profile[]): void {
        // Not logged: this runs on every profile-editor keystroke and every card drag. The
        // create/edit/delete actions behind it are logged where the user performed them.
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        const body = { ...stampFields(FORMAT, FORMAT_VERSION), profiles };
        fs.writeFileSync(this.filePath, JSON.stringify(body, undefined, 4), "utf-8");
    }
}
