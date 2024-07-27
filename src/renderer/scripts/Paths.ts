import { ipcRenderer } from 'electron'

import * as fs from 'fs'
import * as path from 'path'

const AppPath: string = await ipcRenderer.invoke('get-app-path')
const AppDataPath: string = await ipcRenderer.invoke('get-appdata-path')
const LocalAppDataPath: string = await ipcRenderer.invoke('get-localappdata-path')

namespace UnvalidatedPaths {
  export namespace Folder {
    export const Amethyst: string = path.join(...[AppDataPath, 'Amethyst'])
    export const Launcher: string = path.join(...[Amethyst, 'Launcher'])
    export const Versions: string = path.join(...[Amethyst, 'Versions'])
    export const MinecraftUWP: string = path.join(
      ...[LocalAppDataPath, 'Packages', 'Microsoft.MinecraftUWP_8wekyb3d8bbwe']
    )
    export const ComMojang: string = path.join(...[MinecraftUWP, 'LocalState', 'games', 'com.mojang'])
    export const AmethystUWP: string = path.join(...[ComMojang, 'amethyst'])
    export const Mods: string = path.join(...[AmethystUWP, 'Mods'])
  }

  export namespace File {
    export const Versions: string = path.join(...[Folder.Launcher, 'versions.json'])
    export const CachedVersions: string = path.join(...[Folder.Launcher, 'cached_versions.json'])
    export const Profiles: string = path.join(...[Folder.Launcher, 'profiles.json'])
    export const LauncherConfig: string = path.join(...[Folder.AmethystUWP, 'launcher_config.json'])
  }
}

export namespace FolderPaths {
  export const App: string = AppPath
  export const AppData: string = AppDataPath
  export const LocalAppData: string = LocalAppDataPath

  export const Amethyst: string = ValidatePath(UnvalidatedPaths.Folder.Amethyst)
  export const Launcher: string = ValidatePath(UnvalidatedPaths.Folder.Launcher)
  export const Versions: string = ValidatePath(UnvalidatedPaths.Folder.Versions)
  export const Mods: string = ValidatePath(UnvalidatedPaths.Folder.Mods)

  export const ComMojang: string = ValidatePath(UnvalidatedPaths.Folder.ComMojang)
  export const MinecraftUWP: string = ValidatePath(UnvalidatedPaths.Folder.MinecraftUWP)
  export const AmethystUWP: string = ValidatePath(UnvalidatedPaths.Folder.AmethystUWP)
}

export namespace FilePaths {
  export const Versions: string = ValidatePath(UnvalidatedPaths.File.Versions)
  export const CachedVersions: string = ValidatePath(UnvalidatedPaths.File.CachedVersions)
  export const Profiles: string = ValidatePath(UnvalidatedPaths.File.Profiles)
  export const LauncherConfig: string = ValidatePath(UnvalidatedPaths.File.LauncherConfig)
}

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
