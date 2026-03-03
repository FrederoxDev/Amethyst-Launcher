import { ipcRenderer } from 'electron'

import * as fs from 'fs'
import * as path from 'path'
import { PlatformInstance } from '../main'
import { VersionType } from './VersionType'

// PATHS
const AppPath: string = await ipcRenderer.invoke('get-app-path')

const AmethystPath: string = PlatformInstance!.GetAmethystPath();
const LauncherPath: string = path.join(...[AmethystPath, 'Launcher'])
const VersionsPath: string = path.join(...[AmethystPath, 'Versions'])

const VersionsFilePath: string = path.join(...[LauncherPath, 'versions.json'])
const CachedVersionsFilePath: string = path.join(...[LauncherPath, 'cached_versions.json'])
const ProfilesFilePath: string = path.join(...[LauncherPath, 'profiles.json'])

const MinecraftUWPPath: string = PlatformInstance!.GetMinecraftDataPath(VersionType.UWP)
const MinecraftGDKPath: string = PlatformInstance!.GetMinecraftDataPath(VersionType.GDK)
const ComMojangPath: string = path.join(...[MinecraftUWPPath, 'games', 'com.mojang'])
const AmethystUWPPath: string = path.join(...[ComMojangPath, 'amethyst'])

const ModsPath: string = path.join(...[AmethystUWPPath, 'Mods'])
const LauncherConfigPath: string = path.join(...[AmethystUWPPath, 'launcher_config.json'])

// VALIDATED PATHS
export const ElectronAppPath: string = AppPath

export const AmethystFolder: string = ValidatePath(AmethystPath)
export const LauncherFolder: string = ValidatePath(LauncherPath)
export const VersionsFolder: string = ValidatePath(VersionsPath)

export const VersionsFile: string = ValidatePath(VersionsFilePath)
export const CachedVersionsFile: string = ValidatePath(CachedVersionsFilePath)
export const ProfilesFile: string = ValidatePath(ProfilesFilePath)

export const MinecraftUWPFolder: string = ValidatePath(MinecraftUWPPath)
export const MinecraftGDKFolder: string = ValidatePath(MinecraftGDKPath)
export const ComMojangFolder: string = ValidatePath(ComMojangPath)
export const AmethystUWPFolder: string = ValidatePath(AmethystUWPPath)

export const ModsFolder: string = ValidatePath(ModsPath)
export const LauncherConfigFile: string = ValidatePath(LauncherConfigPath)

// PATH FUNCTIONS
export function ValidatePath(in_path: string): string {
  if (!fs.existsSync(in_path)) {
    const in_path_dir: string = path.dirname(in_path)
    fs.mkdirSync(in_path_dir, { recursive: true })
  }
  return in_path
}

export function DeletePath(in_path: string): void {
  if (fs.existsSync(in_path)) {
    fs.rmSync(in_path, { recursive: true })
  }
}
