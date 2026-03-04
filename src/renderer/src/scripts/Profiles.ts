import { UseAppState } from "@renderer/contexts/AppState";
import { InstalledVersion } from "@renderer/scripts/Versions";
import { PathUtils } from "./PathUtils";

const fs = window.require("fs");

function getPaths() {
    return UseAppState.getState().platform.getPaths();
}

export interface Profile {
    name: string;
    runtime: string;
    mods: string[];
    minecraft_version: string;
    installed_version?: InstalledVersion;
}

export function GetProfiles(): Profile[] {
    const paths = getPaths();
    if (!fs.existsSync(paths.profilesFilePath)) return [];

    const json_data = fs.readFileSync(paths.profilesFilePath, "utf-8");
    try {
        return JSON.parse(json_data);
    } catch {
        return [];
    }
}

export function SetProfiles(profiles: Profile[]) {
    const paths = getPaths();
    PathUtils.ValidatePath(paths.profilesFilePath);
    fs.writeFileSync(paths.profilesFilePath, JSON.stringify(profiles, undefined, 4));
}
