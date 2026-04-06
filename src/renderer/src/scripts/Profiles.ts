import { useAppStore } from "@renderer/states/AppStore";
import { PathUtils } from "./PathUtils";

const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");

function getPaths() {
    return useAppStore.getState().platform.getPaths();
}

export interface Profile {
    uuid: string;
    name: string;
    is_modded: boolean;
    runtime: string;
    mods: string[];
    minecraft_version: string | null;
    /** UUID of the installed version, used for imported versions that may not exist in the remote database. */
    version_uuid?: string | null;
}

/** Returns the absolute path to the mods directory for a given profile UUID. */
export function GetProfileModsPath(profileUuid: string): string {
    const paths = getPaths();
    return path.join(paths.profilesPath, profileUuid, "mods");
}

/** Returns the absolute path to config.json for a given profile UUID. */
export function GetProfileConfigPath(profileUuid: string): string {
    const paths = getPaths();
    return path.join(paths.profilesPath, profileUuid, "config.json");
}

export function GetProfiles(): Profile[] {
    const paths = getPaths();
    if (!fs.existsSync(paths.profilesPath)) return [];

    let profileDirs: string[];
    try {
        profileDirs = (fs.readdirSync(paths.profilesPath, { withFileTypes: true }) as import("fs").Dirent[])
            .filter(f => f.isDirectory())
            .map(d => d.name);
    } catch {
        return [];
    }

    const profiles: Profile[] = [];
    for (const uuid of profileDirs) {
        const configPath = path.join(paths.profilesPath, uuid, "config.json");
        if (!fs.existsSync(configPath)) continue;
        try {
            const profile = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Profile;
            // Enforce UUID matches the directory name (source of truth)
            profile.uuid = uuid;
            profiles.push(profile);
        } catch {
            console.warn(`[Profiles] Failed to parse config for profile dir "${uuid}", skipping.`);
        }
    }

    return profiles;
}

export function SetProfile(profile: Profile): void {
    const paths = getPaths();
    const profileDir = path.join(paths.profilesPath, profile.uuid);
    const configPath = path.join(profileDir, "config.json");
    const modsDir = path.join(profileDir, "mods");

    fs.mkdirSync(profileDir, { recursive: true });
    fs.mkdirSync(modsDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(profile, undefined, 4));
}

export function SetProfiles(profiles: Profile[]): void {
    for (const profile of profiles) {
        SetProfile(profile);
    }
}

export function DeleteProfileFolder(profileUuid: string): void {
    const paths = getPaths();
    PathUtils.DeletePath(path.join(paths.profilesPath, profileUuid));
}

function copyDirRecursive(src: string, dst: string): void {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true }) as import("fs").Dirent[]) {
        const srcChild = path.join(src, entry.name);
        const dstChild = path.join(dst, entry.name);
        if (entry.isDirectory()) {
            copyDirRecursive(srcChild, dstChild);
        } else {
            fs.copyFileSync(srcChild, dstChild);
        }
    }
}

/**
 * One-time migration from the old profiles.json + global Mods/ structure to per-profile folders.
 * Safe to call on every startup — subsequent calls are no-ops once migration is complete.
 */
export function MigrateProfiles(): void {
    const paths = getPaths();
    const oldProfilesJson = path.join(paths.profilesPath, "profiles.json");
    const migratedMarker = path.join(paths.profilesPath, "profiles.json.migrated");

    if (!fs.existsSync(oldProfilesJson)) return;
    if (fs.existsSync(migratedMarker)) return;

    let oldProfiles: Profile[] = [];
    try {
        oldProfiles = JSON.parse(fs.readFileSync(oldProfilesJson, "utf-8")) as Profile[];
    } catch {
        console.warn("[Migration] Could not parse old profiles.json, skipping migration.");
        return;
    }

    // launcherPath is the parent of profilesPath
    const launcherPath = path.dirname(paths.profilesPath);
    const oldModsRoot = path.join(launcherPath, "Mods");

    for (const profile of oldProfiles) {
        if (!profile.uuid) {
            profile.uuid = crypto.randomUUID();
        }

        const profileDir = path.join(paths.profilesPath, profile.uuid);
        const profileConfigPath = path.join(profileDir, "config.json");
        const profileModsDir = path.join(profileDir, "mods");

        // Skip if already migrated (partial migration safety)
        if (fs.existsSync(profileConfigPath)) continue;

        fs.mkdirSync(profileDir, { recursive: true });
        fs.mkdirSync(profileModsDir, { recursive: true });
        fs.writeFileSync(profileConfigPath, JSON.stringify(profile, undefined, 4));

        // Copy mods from global Mods/ to per-profile mods/ where source exists
        for (const modId of profile.mods ?? []) {
            const srcMod = path.join(oldModsRoot, modId);
            const dstMod = path.join(profileModsDir, modId);
            if (fs.existsSync(srcMod) && !fs.existsSync(dstMod)) {
                try {
                    copyDirRecursive(srcMod, dstMod);
                } catch (e) {
                    console.warn(`[Migration] Failed to copy mod "${modId}" for profile "${profile.uuid}":`, e);
                }
            }
        }
    }

    fs.renameSync(oldProfilesJson, migratedMarker);
    console.log("[Migration] Profile migration complete.");
}
