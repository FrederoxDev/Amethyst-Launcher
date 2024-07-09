import { ValidatePath, LauncherFolder} from "./Paths";

const fs = window.require('fs') as typeof import('fs');
const path = window.require('path') as typeof import('path');

export type Profile = {
    name: string,
    runtime: string,
    mods: string[]
    minecraft_version: string
};

export function findAllProfiles(): Profile[] {
    const profilesFile = path.join(LauncherFolder, "profiles.json");
    if (!fs.existsSync(profilesFile)) return [];

    const jsonData = fs.readFileSync(profilesFile, "utf-8");
    try {
        return JSON.parse(jsonData);
    } catch {
        return [];
    }
}

export function saveAllProfiles(profiles: Profile[]) {
    const profilesFile = path.join(LauncherFolder, "profiles.json");
    ValidatePath(profilesFile);
    fs.writeFileSync(profilesFile, JSON.stringify(profiles, undefined, 4));
}