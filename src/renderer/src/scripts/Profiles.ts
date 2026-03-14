import { useAppStore } from "@renderer/states/AppStore";
import { PathUtils } from "./PathUtils";

const fs = window.require("fs");

function getPaths() {
    return useAppStore.getState().platform.getPaths();
}

export interface Profile {
    uuid: string;
    name: string;
    runtime: string;
    mods: string[];
    minecraft_version: string | null;
    /** UUID of the installed version, used for imported versions that may not exist in the remote database. */
    version_uuid?: string | null;
    use_split_data_folder?: boolean;
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
