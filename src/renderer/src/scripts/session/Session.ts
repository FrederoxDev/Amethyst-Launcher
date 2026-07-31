import { Channel } from "@renderer/scripts/domain/Channel";

const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");

export const SESSION_FILENAME = ".amethyst-session.json";

export const SESSION_SCHEMA = 1;

/**
 * Launcher -> runtime contract, written into the profile's data folder immediately
 * before activation. The runtime finds it via the game's own data folder, so it
 * needs no knowledge of where the launcher keeps anything.
 */
export interface SessionManifest {
    schema: typeof SESSION_SCHEMA;
    launchedAt: string;
    profile: { uuid: string; name: string };
    channel: Channel;
    version: { uuid: string; label: string; path: string };
    runtime: { id: string; path: string } | null;
    mods: { id: string; path: string }[];
}

export function sessionPath(dataDir: string): string {
    return path.join(dataDir, SESSION_FILENAME);
}

export function writeSession(dataDir: string, manifest: SessionManifest): void {
    fs.mkdirSync(dataDir, { recursive: true });
    const target = sessionPath(dataDir);
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(manifest, undefined, 2), "utf-8");
    fs.renameSync(tmp, target);
}

export function clearSession(dataDir: string): void {
    fs.rmSync(sessionPath(dataDir), { force: true });
}
