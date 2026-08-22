import { Channel, isChannel } from "@renderer/scripts/domain/Channel";
import { log } from "@renderer/scripts/LauncherLog";
import { describeError } from "@shared/diagnostics/Log";

const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");

const SESSION_FILENAME = ".amethyst-session.json";

export const SESSION_SCHEMA = 1;

/**
 * Launcher -> runtime contract, written into the profile's data folder immediately
 * before activation and deleted once the launch has settled. The runtime finds it via
 * the game's own data folder, so it needs no knowledge of where the launcher keeps
 * anything; a build started outside the launcher finds nothing and runs vanilla.
 */
export interface SessionManifest {
    schema: typeof SESSION_SCHEMA;
    launchedAt: string;
    profile: { uuid: string; name: string };
    channel: Channel;
    version: { uuid: string; label: string; path: string };
    runtime: { id: string; path: string } | null;
    mods: { id: string; path: string }[];
    /** Developer mode was on for this launch, so the runtime should prompt for a debugger. */
    developerMode: boolean;
}

function sessionPath(dataDir: string): string {
    return path.join(dataDir, SESSION_FILENAME);
}

function writeManifest(target: string, manifest: SessionManifest): void {
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(manifest, undefined, 2), "utf-8");
    fs.renameSync(tmp, target);
}

function isEntry(value: unknown): value is { id: string; path: string } {
    const entry = value as { id?: unknown; path?: unknown } | null;
    return typeof entry === "object" && entry !== null && typeof entry.id === "string" && typeof entry.path === "string";
}

/**
 * The manifest the runtime reads, checked field by field before anything is done with it.
 * Anything that does not answer to the contract is not a manifest this launcher wrote, and
 * rewriting one field of it would hand the runtime a file the launcher has vouched for.
 */
function parseSession(raw: string): SessionManifest | null {
    const value = JSON.parse(raw) as Partial<SessionManifest> | null;
    if (typeof value !== "object" || value === null) return null;
    if (value.schema !== SESSION_SCHEMA) return null;
    if (typeof value.launchedAt !== "string") return null;
    if (typeof value.profile?.uuid !== "string" || typeof value.profile.name !== "string") return null;
    if (!isChannel(value.channel)) return null;
    if (
        typeof value.version?.uuid !== "string"
        || typeof value.version.label !== "string"
        || typeof value.version.path !== "string"
    ) {
        return null;
    }
    if (value.runtime !== null && !isEntry(value.runtime)) return null;
    if (!Array.isArray(value.mods) || !value.mods.every(isEntry)) return null;
    if (typeof value.developerMode !== "boolean") return null;
    return value as SessionManifest;
}

export function writeSession(dataDir: string, manifest: SessionManifest): void {
    fs.mkdirSync(dataDir, { recursive: true });
    writeManifest(sessionPath(dataDir), manifest);
}

export function updateSessionDeveloperMode(dataDir: string, developerMode: boolean): void {
    const target = sessionPath(dataDir);
    if (!fs.existsSync(target)) return;

    try {
        const manifest = parseSession(fs.readFileSync(target, "utf-8"));
        if (!manifest) {
            log("Session", `${target} does not answer to the session contract, leaving it alone`);
            return;
        }
        manifest.developerMode = developerMode;
        writeManifest(target, manifest);
        log("Session", `Updated developer mode in ${target}: ${developerMode}`);
    } catch (e) {
        log("Session", `Could not update developer mode in ${target}: ${describeError(e)}`);
    }
}
