import { json } from 'stream/consumers'
import { VersionsFolder, CachedVersionsFile, VersionsFile } from './Paths'
import { SemVersion } from './classes/SemVersion'

import * as fs from 'fs'
import * as path from 'path'

export enum MinecraftVersionType {
  UwpStable = 0,
  UwpBeta = 1,
  UwpPreview = 2,
  GdkRelease = 3,
  GdkPreview = 4
}

interface UWPMinecraftVersion {
  type: 'uwp';
  version: SemVersion;
  uuid: string;
  versionType: MinecraftVersionType;
}

export interface GDKMinecraftVersion {
  type: 'gdk';
  versionType: MinecraftVersionType;
  version: SemVersion;
  urls: string[];
};

export type MinecraftVersion = UWPMinecraftVersion | GDKMinecraftVersion;

export interface GDKVersionsList {
  file_version: number;
  previewVersions: RawGDKVersion[];
  releaseVersions: RawGDKVersion[];
}

interface RawGDKVersion {
  version: string;
  urls: string[];
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
      const sem_version = SemVersion.fromString(SemVersion.toString(installed_version.version.version))
      const minecraft_version: UWPMinecraftVersion = {
        type: 'uwp',
        version: sem_version,
        uuid: installed_version.version.uuid,
        versionType: installed_version.version.versionType
      }

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
  version: UWPMinecraftVersion
}

function ParseUwpVersionData(version: [string, string, MinecraftVersionType]): UWPMinecraftVersion {
  return {
    type: 'uwp',
    version: SemVersion.fromString(version[0]),
    uuid: version[1],
    versionType: version[2]
  }
}

function ParseGdkVersionData(raw: RawGDKVersion, type: MinecraftVersionType): GDKMinecraftVersion {
  const versionString = raw.version.replace(type === MinecraftVersionType.GdkRelease ? "Release " : "Preview ", "")

  return {
    type: 'gdk',
    version: SemVersion.fromString(versionString),
    versionType: type,
    urls: raw.urls
  }
}

export async function FetchMinecraftVersions(): Promise<MinecraftVersion[]> {
  let lastWriteTime: Date = new Date(0)

  if (fs.existsSync(CachedVersionsFile)) {
    const fileInfo = fs.statSync(CachedVersionsFile)
    lastWriteTime = fileInfo.mtime
  }

  // Only fetch the data every hour
  const currentTime = new Date()
  const discardOldDataTime = new Date(currentTime.getTime() - 60 * 60 * 1000)

  const uwpFetchUrl = "https://raw.githubusercontent.com/AmethystAPI/Launcher-Data/refs/heads/main/versions.json.min"
  const gdkFetchUrl = "https://raw.githubusercontent.com/LukasPAH/minecraft-windows-gdk-version-db/refs/heads/main/historical_versions.json"

  if (lastWriteTime < discardOldDataTime) {
    console.log(`Fetching minecraft versions from ${uwpFetchUrl}`)
    const rawUwpData = await fetch(uwpFetchUrl)

    if (!rawUwpData.ok) {
      throw new Error(
        `Failed to fetch UWP version list from: ${uwpFetchUrl}`
      )
    }

    const rawGdkData = await fetch(gdkFetchUrl)
    if (!rawGdkData.ok) {
      throw new Error(
        `Failed to fetch GDK version list from: ${gdkFetchUrl}`
      )
    }

    const gdkData = JSON.parse(await rawGdkData.text()) as GDKVersionsList
    const uwpData = (JSON.parse(await rawUwpData.text()) as [string, string, MinecraftVersionType][]).map(ParseUwpVersionData)

    if (gdkData.file_version !== 0) {
      throw new Error(
        `GDK version list changed file version! Expected 0, got ${gdkData.file_version}`
      )
    }

    const allVersions: MinecraftVersion[] = [
      ...uwpData, 
      ...gdkData.releaseVersions.map(v => ParseGdkVersionData(v, MinecraftVersionType.GdkRelease)), 
      ...gdkData.previewVersions.map(v => ParseGdkVersionData(v, MinecraftVersionType.GdkPreview))
    ];

    fs.writeFileSync(CachedVersionsFile, JSON.stringify(allVersions, undefined, 4))
    return allVersions
  }

  interface StringifiedVersion {
    version: {
      major: number;
      minor: number;
      patch: number;
      build: number;
    }
  }

  const versionData = JSON.parse(fs.readFileSync(CachedVersionsFile, 'utf-8')) as StringifiedVersion[];

  return versionData.map(version => {
    return {
      ...version,
      version: new SemVersion(
        version.version.major,
        version.version.minor,
        version.version.patch,
        version.version.build
      )
    } as MinecraftVersion
  });
}

export function GetInstalledVersions(): UWPMinecraftVersion[] {
  if (fs.existsSync(VersionsFolder)) {
    const version_list: UWPMinecraftVersion[] = []

    const version_dirs = fs.readdirSync(VersionsFolder, { withFileTypes: true }).filter(entry => entry.isDirectory())

    for (const version_dir of version_dirs) {
      const dir_path = path.join(version_dir.parentPath, version_dir.name)

      if (fs.existsSync(dir_path)) {
        if (version_dir.name.startsWith('Minecraft-')) {
          const sem_version = SemVersion.fromString(version_dir.name.slice('Minecraft-'.length))

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

export function ValidateVersionsFile(): void {
  if (!fs.existsSync(VersionsFile)) {
    const default_version_file: VersionsFileObject = {
      installed_versions: [],
      default_installation_path: VersionsFolder
    }

    const versions_file_string = JSON.stringify(default_version_file, undefined, 4)

    fs.writeFileSync(VersionsFile, versions_file_string)
  }

  const installed_versions = GetInstalledVersionsFromFile().filter(version => {
    fs.existsSync(version.path)
  })

  const old_versions = GetInstalledVersions()

  for (const old_version of old_versions) {
    if (installed_versions.find(version => version.version.toString() === old_version.toString()) === undefined) {
      installed_versions.push({
        path: path.join(VersionsFolder, `Minecraft-${old_version.version.toString()}`),
        version: old_version
      })
    }
  }

  if (fs.existsSync(VersionsFile)) {
    const version_file_text = fs.readFileSync(VersionsFile, 'utf-8')
    const version_file_data: VersionsFileObject = JSON.parse(version_file_text) as VersionsFileObject

    version_file_data.installed_versions = installed_versions

    fs.writeFileSync(VersionsFile, JSON.stringify(version_file_data, undefined, 4))
  }
}

export function GetInstalledVersionsFromFile(): InstalledVersion[] {
  let installed_versions: InstalledVersion[] = []

  if (fs.existsSync(VersionsFile)) {
    const version_file_text = fs.readFileSync(VersionsFile, 'utf-8')
    const version_file_data: VersionsFileObject = VersionsFileObject.fromString(version_file_text)

    installed_versions = version_file_data.installed_versions
  }
  return installed_versions
}

export function GetInstalledVersionPath(version: UWPMinecraftVersion): string | undefined {
  const versions = GetInstalledVersionsFromFile()

  const version_path = versions.find(in_version => in_version.version.uuid === version.uuid)?.path

  if (!version_path) {
    console.warn(`Version ${version.toString()} not found in installed versions`)
  }

  return version_path
}

export function FindMinecraftVersion(sem_version: SemVersion) {
  const versionData = fs.readFileSync(CachedVersionsFile, 'utf-8')
  const rawJson = JSON.parse(versionData)

  for (const version of rawJson) {
    if ((version[0] as string) === sem_version.toString())
      return ParseUwpVersionData(version as [string, string, MinecraftVersionType])
  }
}
