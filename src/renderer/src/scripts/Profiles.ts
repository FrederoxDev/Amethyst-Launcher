import { useAppStore } from "@renderer/states/AppStore";
import { PathUtils } from "./PathUtils";
import { MinecraftVersionType } from "./VersionDatabase";
import { VersionManager } from "./VersionManager";

const fs = window.require("fs");

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

/**
 * Determines whether a profile targets a release or preview build.
 * Resolved via the installed version pointed to by version_uuid; falls back
 * to "release" when the type can't be determined.
 */
export function getProfileType(profile: Profile, versionManager: VersionManager): MinecraftVersionType {
    if (profile.version_uuid) {
        const installed = versionManager.getInstalledVersionByUUID(profile.version_uuid);
        if (installed) return installed.type;
    }
    return "release";
}

export function GetProfiles(): Profile[] {
    const paths = getPaths();
    if (!fs.existsSync(paths.profilesFilePath)) return [];

    const json_data = fs.readFileSync(paths.profilesFilePath, "utf-8");
    try {
        const profiles = JSON.parse(json_data) as Profile[];
        let migrated = false;
        for (const profile of profiles) {
            if (!profile.uuid) {
                profile.uuid = crypto.randomUUID();
                migrated = true;
            }
            if (profile.is_modded === undefined) {
                profile.is_modded = profile.runtime !== "Vanilla";
                migrated = true;
            }
        }
        if (migrated) {
            PathUtils.ValidatePath(paths.profilesFilePath);
            fs.writeFileSync(paths.profilesFilePath, JSON.stringify(profiles, undefined, 4));
        }
        return profiles;
    } catch {
        return [];
    }
}

export function SetProfiles(profiles: Profile[]) {
    const paths = getPaths();
    PathUtils.ValidatePath(paths.profilesFilePath);
    fs.writeFileSync(paths.profilesFilePath, JSON.stringify(profiles, undefined, 4));
}
