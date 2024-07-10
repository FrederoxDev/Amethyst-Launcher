import { ValidatePath, LauncherFolder} from "./Paths";

const fs = window.require('fs') as typeof import('fs');
const path = window.require('path') as typeof import('path');

export interface Profile {
    name: string,
    runtime: string,
    mods: string[]
    minecraft_version: string
}

export function GetProfiles(): Profile[] {
    const profiles_filepath = path.join(LauncherFolder, "profiles.json");
    if (!fs.existsSync(profiles_filepath)) return [];

    const jsonData = fs.readFileSync(profiles_filepath, "utf-8");
    try {
        return JSON.parse(jsonData);
    } catch {
        return [];
    }
}

export function SetProfiles(profiles: Profile[]) {
    const profiles_filepath = path.join(LauncherFolder, "profiles.json");
    ValidatePath(profiles_filepath);
    fs.writeFileSync(profiles_filepath, JSON.stringify(profiles, undefined, 4));
}