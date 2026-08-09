import { Channel } from "@renderer/scripts/domain/Channel";
import { ensureParentExists, errnoCode, isDirEmpty } from "@renderer/scripts/Directories";
import { log } from "@renderer/scripts/LauncherLog";

const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");
const os = window.require("os") as typeof import("os");

/**
 * State of the roaming folder Minecraft reads its data from. `empty-dir` is split
 * from `foreign-data` here so nothing downstream has to re-decide what is safe to
 * replace.
 */
export type LinkState =
    | { kind: "absent" }
    | { kind: "linked"; target: string }
    | { kind: "empty-dir" }
    | { kind: "foreign-data" }
    | { kind: "blocked-by-file" };

const ROAMING_DIR: Record<Channel, string> = {
    release: "Minecraft Bedrock",
    preview: "Minecraft Bedrock Preview",
};

export function roamingPath(channel: Channel): string {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, ROAMING_DIR[channel]);
}

function stripNtPrefix(target: string): string {
    return path.resolve(target.startsWith("\\\\?\\") ? target.slice(4) : target);
}

/** Message plus errno, because the code is what says whether a failure is repairable. */
function describe(e: unknown): string {
    const code = errnoCode(e);
    const message = e instanceof Error ? e.message : String(e);
    return code ? `${message} (${code})` : message;
}

/** Which of a folder's contents made it "foreign", capped so a full game data folder is not listed. */
function firstEntries(dir: string, limit = 6): string {
    try {
        const entries = fs.readdirSync(dir);
        const shown = entries.slice(0, limit).join(", ");
        return entries.length > limit ? `${shown} (+${entries.length - limit} more)` : shown;
    } catch (e) {
        return `unreadable: ${describe(e)}`;
    }
}

export function readLink(channel: Channel): LinkState {
    const p = roamingPath(channel);

    let st: import("fs").Stats;
    try {
        st = fs.lstatSync(p);
    } catch (e) {
        if (errnoCode(e) === "ENOENT") {
            log("DataLink", `${channel} game data folder ${p} does not exist`);
            return { kind: "absent" };
        }
        log("DataLink", `Could not read ${p} for ${channel}: ${describe(e)}`);
        throw new Error(
            `Minecraft's ${channel} data folder could not be read, so this profile cannot be set up.\n\n`
            + `${FOLDER_IN_USE_NEXT_STEP}\n\n"${p}"`,
            { cause: e }
        );
    }

    if (st.isSymbolicLink()) {
        const target = stripNtPrefix(fs.readlinkSync(p));
        log("DataLink", `${channel} game data folder ${p} is a junction to ${target}`);
        return { kind: "linked", target };
    }

    if (!st.isDirectory()) {
        log("DataLink", `${channel} game data path ${p} is a file of ${st.size} bytes, not a folder`);
        return { kind: "blocked-by-file" };
    }

    if (isDirEmpty(p)) {
        log("DataLink", `${channel} game data folder ${p} is a real, empty folder`);
        return { kind: "empty-dir" };
    }

    log("DataLink", `${channel} game data folder ${p} is a real folder holding: ${firstEntries(p)}`);
    return { kind: "foreign-data" };
}

/** Whatever holds the folder is a running program or an open window, so the fix is the same one. */
const FOLDER_IN_USE_NEXT_STEP =
    "Close Minecraft and any window showing that folder, then press Play again.";

export function link(channel: Channel, target: string): void {
    const p = roamingPath(channel);
    try {
        fs.mkdirSync(target, { recursive: true });
        ensureParentExists(p);
        fs.symlinkSync(path.resolve(target), p, "junction");
    } catch (e) {
        log("DataLink", `Could not point ${p} at ${target} for ${channel}: ${describe(e)}`);
        throw new Error(
            `Minecraft's ${channel} data folder could not be pointed at this profile.\n\n`
            + `${FOLDER_IN_USE_NEXT_STEP}\n\n"${p}"`,
            { cause: e }
        );
    }
    log("DataLink", `Junction created: ${p} -> ${path.resolve(target)}`);
}

/** Removes the junction only; the target keeps its contents. */
export function unlink(channel: Channel): void {
    const p = roamingPath(channel);
    try {
        fs.unlinkSync(p);
    } catch (e) {
        log("DataLink", `Could not remove the ${channel} junction at ${p}: ${describe(e)}`);
        throw new Error(
            `Minecraft's ${channel} data folder could not be unlinked from the profile using it.\n\n`
            + `${FOLDER_IN_USE_NEXT_STEP}\n\n"${p}"`,
            { cause: e }
        );
    }
    log("DataLink", `Junction removed: ${p}`);
}

export function removeEmptyDir(channel: Channel): void {
    const p = roamingPath(channel);
    try {
        fs.rmdirSync(p);
    } catch (e) {
        log("DataLink", `Could not remove the empty ${channel} folder at ${p}: ${describe(e)}`);
        throw new Error(
            `The empty folder Minecraft's ${channel} data would replace could not be removed.\n\n`
            + `${FOLDER_IN_USE_NEXT_STEP}\n\n"${p}"`,
            { cause: e }
        );
    }
    log("DataLink", `Removed empty folder ${p}`);
}
