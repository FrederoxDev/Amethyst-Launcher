import { FilePaths, FolderPaths } from './Paths'
import { SemVersion } from './types/SemVersion'
import { Console } from './types/Console'

import * as fs from 'fs'
import * as path from 'path'

////////////////////////
// CURRENT VERSIONING //
////////////////////////

export enum MinecraftVersionType {
  Release = 0,
  Beta = 1,
  Preview = 2
}

export class MinecraftVersion {
  version: SemVersion
  uuid: string
  versionType: MinecraftVersionType

  constructor(version: SemVersion, uuid: string, versionType: MinecraftVersionType) {
    this.version = version
    this.uuid = uuid
    this.versionType = versionType
  }

  toString(): string {
    let prefix = ''
    if (this.versionType === MinecraftVersionType.Beta) prefix = '-beta'
    else if (this.versionType === MinecraftVersionType.Preview) prefix = '-preview'

    return `${SemVersion.toPrimitive(this.version)}${prefix}`
  }

  static toString(version: MinecraftVersion) {
    let prefix = ''
    if (version.versionType === MinecraftVersionType.Beta) prefix = '-beta'
    else if (version.versionType === MinecraftVersionType.Preview) prefix = '-preview'

    return `${SemVersion.toPrimitive(version.version)}${prefix}`
  }
}

export class VersionsFileObject {
  installed_versions: InstalledVersion[]
  default_installation_path: string

  constructor(versions: InstalledVersion[], install_path: string) {
    this.installed_versions = versions
    this.default_installation_path = install_path
  }

  static fromString(string: string): VersionsFileObject {
    const obj = JSON.parse(string) as VersionsFileObject

    const default_installation_path = obj.default_installation_path

    const installed_versions = obj.installed_versions.map(installed_version => {
      const sem_version = SemVersion.fromPrimitive(SemVersion.toPrimitive(installed_version.version.version))
      const minecraft_version = new MinecraftVersion(
        sem_version,
        installed_version.version.uuid,
        installed_version.version.versionType
      )

      return {
        path: installed_version.path,
        version: minecraft_version
      } as InstalledVersion
    })

    return {
      default_installation_path: default_installation_path,
      installed_versions: installed_versions
    } as VersionsFileObject
  }
}

export interface InstalledVersion {
  path: string
  version: MinecraftVersion
}

////////////////////////////////////////////////////////////

export async function FetchMinecraftVersions() {
  let lastWriteTime: Date = new Date(0)

  if (fs.existsSync(FilePaths.CachedVersions)) {
    const fileInfo = fs.statSync(FilePaths.CachedVersions)
    lastWriteTime = fileInfo.mtime
  }

  // Only fetch the data every hour
  const currentTime = new Date()
  const discardOldDataTime = new Date(currentTime.getTime() - 60 * 60 * 1000)

  if (lastWriteTime < discardOldDataTime) {
    Console.StartGroup(Console.ActionStr('Fetching Versions'))
    {
      Console.Group(Console.InfoStr('URL'), () => {
        console.log('https://raw.githubusercontent.com/AmethystAPI/Launcher-Data/main/versions.json.min')
      })

      if (navigator.onLine) {
        try {
          const start_time = performance.now()
          const data = await fetch('https://raw.githubusercontent.com/AmethystAPI/Launcher-Data/main/versions.json.min')
          const end_time = performance.now()
          if (data.ok) {
            fs.writeFileSync(FilePaths.CachedVersions, await data.text())
            Console.Group(Console.ResultStr('Successful'), () => {
              Console.Info(`Elapsed Time: ${Math.round((end_time - start_time + Number.EPSILON) * 100) / 100}ms`)
            })
          }
        } catch (error) {
          Console.Group(Console.ResultStr('Failed', true), () => {
            Console.Error(`${error}`)
          })
        }
      } else {
        Console.Group(Console.ResultStr('Failed', true), () => {
          Console.Error('Internet is offline')
        })
      }
    }
    Console.EndGroup()
  }

  const versionData = fs.readFileSync(FilePaths.CachedVersions, 'utf-8')
  const rawJson = JSON.parse(versionData)
  const versions: MinecraftVersion[] = []

  for (const version of rawJson) {
    versions.push(
      new MinecraftVersion(
        SemVersion.fromPrimitive(version[0] as string),
        version[1],
        version[2] as unknown as MinecraftVersionType
      )
    )
  }

  return versions
}

////////////////////////////////////////////////////////////

export function GetInstalledVersions(): MinecraftVersion[] {
  if (fs.existsSync(FolderPaths.Versions)) {
    const version_list: MinecraftVersion[] = []

    const version_dirs = fs.readdirSync(FolderPaths.Versions, { withFileTypes: true }).filter(entry => entry.isDirectory())

    for (const version_dir of version_dirs) {
      const dir_path = path.join(version_dir.parentPath, version_dir.name)

      if (fs.existsSync(dir_path)) {
        if (version_dir.name.startsWith('Minecraft-')) {
          const sem_version = SemVersion.fromPrimitive(version_dir.name.slice('Minecraft-'.length))

          const minecraft_version = FindMinecraftVersion(sem_version)

          if (minecraft_version) {
            version_list.push(minecraft_version)
          }
        }
      }
    }

    return version_list
  } else {
    return []
  }
}

////////////////////////////////////////////////////////////

export function ValidateVersionsFile(): void {
  if (!fs.existsSync(FilePaths.Versions)) {
    const default_version_file: VersionsFileObject = {
      installed_versions: [],
      default_installation_path: FolderPaths.Versions
    }

    const versions_file_string = JSON.stringify(default_version_file, undefined, 4)

    fs.writeFileSync(FilePaths.Versions, versions_file_string)
  }

  const installed_versions = GetInstalledVersionsFromFile().filter(version => {
    fs.existsSync(version.path)
  })

  const old_versions = GetInstalledVersions()

  for (const old_version of old_versions) {
    if (installed_versions.find(version => version.version.toString() === old_version.toString()) === undefined) {
      installed_versions.push({
        path: path.join(FolderPaths.Versions, `Minecraft-${SemVersion.toPrimitive(old_version.version)}`),
        version: old_version
      })
    }
  }

  if (fs.existsSync(FilePaths.Versions)) {
    const version_file_text = fs.readFileSync(FilePaths.Versions, 'utf-8')
    const version_file_data: VersionsFileObject = JSON.parse(version_file_text) as VersionsFileObject

    version_file_data.installed_versions = installed_versions

    fs.writeFileSync(FilePaths.Versions, JSON.stringify(version_file_data, undefined, 4))
  }
}

////////////////////////////////////////////////////////////

export function GetInstalledVersionsFromFile(): InstalledVersion[] {
  let installed_versions: InstalledVersion[] = []

  if (fs.existsSync(FilePaths.Versions)) {
    const version_file_text = fs.readFileSync(FilePaths.Versions, 'utf-8')
    const version_file_data: VersionsFileObject = VersionsFileObject.fromString(version_file_text)

    installed_versions = version_file_data.installed_versions
  }
  return installed_versions
}

////////////////////////////////////////////////////////////

export function GetInstalledVersionPath(version: MinecraftVersion): string | undefined {
  const versions = GetInstalledVersionsFromFile()

  const version_path = versions.find(in_version => in_version.version.uuid === version.uuid)?.path

  if (!version_path) {
    console.warn(`Version ${version.toString()} not found in installed versions`)
  }

  return version_path
}

////////////////////////////////////////////////////////////

export function FindMinecraftVersion(sem_version: SemVersion) {
  const versionData = fs.readFileSync(FilePaths.CachedVersions, 'utf-8')
  const rawJson = JSON.parse(versionData)

  for (const version of rawJson) {
    if ((version[0] as string) === SemVersion.toPrimitive(sem_version))
      return new MinecraftVersion(
        SemVersion.fromPrimitive(version[0] as string),
        version[1],
        version[2] as unknown as MinecraftVersionType
      )
  }
}
