import { Channel } from "@renderer/scripts/domain/Channel";
import { ensureParentExists, errnoCode, isDirEmpty } from "@renderer/scripts/Directories";

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

export function readLink(channel: Channel): LinkState {
    const p = roamingPath(channel);

    let st: import("fs").Stats;
    try {
        st = fs.lstatSync(p);
    } catch (e) {
        if (errnoCode(e) === "ENOENT") return { kind: "absent" };
        throw e;
    }

    if (st.isSymbolicLink()) return { kind: "linked", target: stripNtPrefix(fs.readlinkSync(p)) };

    if (!st.isDirectory()) return { kind: "blocked-by-file" };
    return isDirEmpty(p) ? { kind: "empty-dir" } : { kind: "foreign-data" };
}

export function link(channel: Channel, target: string): void {
    const p = roamingPath(channel);
    fs.mkdirSync(target, { recursive: true });
    ensureParentExists(p);
    fs.symlinkSync(path.resolve(target), p, "junction");
}

/** Removes the junction only; the target keeps its contents. */
export function unlink(channel: Channel): void {
    fs.unlinkSync(roamingPath(channel));
}

export function removeEmptyDir(channel: Channel): void {
    fs.rmdirSync(roamingPath(channel));
}
