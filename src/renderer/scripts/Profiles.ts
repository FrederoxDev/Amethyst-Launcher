import { ValidatePath, ProfilesFile } from "./Paths";
import { InstalledVersion } from "./Versions";

import * as fs from 'fs';

export interface Profile {
    name: string,
    runtime: string,
    mods: string[]
    minecraft_version: string
    installed_version?: InstalledVersion;
}

export function GetProfiles(): Profile[] {
    if (!fs.existsSync(ProfilesFile)) return [];

    const json_data = fs.readFileSync(ProfilesFile, "utf-8");
    try {
        return JSON.parse(json_data);
    } catch {
        return [];
    }
}

export function SetProfiles(profiles: Profile[]) {
    ValidatePath(ProfilesFile);
    fs.writeFileSync(ProfilesFile, JSON.stringify(profiles, undefined, 4));
}