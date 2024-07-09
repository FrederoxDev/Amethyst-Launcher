import { ipcRenderer } from "electron";

const fs = window.require('fs') as typeof import('fs')
const path = window.require('path') as typeof import('path')

const LocalAppDataPath:             string = await ipcRenderer.invoke("get-localappdata-path");

const AppPath:                      string = await ipcRenderer.invoke("get-app-path");

const AmethystPath:                 string = path.join(...[LocalAppDataPath, "Amethyst"]);
const LauncherPath:                 string = path.join(...[AmethystPath, "Launcher"]);
const VersionsPath:                 string = path.join(...[AmethystPath, "Versions"]);
const MinecraftUWPPath:             string = path.join(...[LocalAppDataPath, "Packages", "Microsoft.MinecraftUWP_8wekyb3d8bbwe"]);
const ComMojangPath:                string = path.join(...[MinecraftUWPPath, "LocalState", "games", "com.mojang"]);
const AmethystUWPPath:              string = path.join(...[ComMojangPath, "amethyst"]);
const ModsPath:                     string = path.join(...[AmethystUWPPath, 'mods']);
const LauncherConfigPath:           string = path.join(...[AmethystUWPPath, "launcher_config.json"]);

export const AmethystFolder:        string = ValidatePath(AmethystPath);
export const LauncherFolder:        string = ValidatePath(LauncherPath);
export const VersionsFolder:        string = ValidatePath(VersionsPath);
export const ModsFolder:            string = ValidatePath(ModsPath);
export const LauncherConfigFile:    string = ValidatePath(LauncherConfigPath);
export const ComMojangFolder:       string = ValidatePath(ComMojangPath);
export const AmethystUWPFolder:     string = ValidatePath(AmethystUWPPath);
export const MinecraftUWPFolder:    string = ValidatePath(MinecraftUWPPath);

export const ElectronAppPath:       string = AppPath;

export function ValidatePath(in_path: string): string {
    if (!fs.existsSync(in_path)) {
        const in_path_dir: string = path.dirname(in_path);
        fs.mkdirSync(in_path_dir, { recursive: true })
    }
    return in_path;
}

export function DeletePath(in_path: string): void {
    if (fs.existsSync(in_path)) {
        fs.rmSync(in_path, { recursive: true });
    }
}