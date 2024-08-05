import { FilePaths, FolderPaths } from '../Paths'
import { SemVersion } from './SemVersion'
import { Console } from './Console'

import AJV_Instance from '../schemas/AJV_Instance'
import { JSONSchemaType } from 'ajv'
import * as fs from 'node:fs'
import path from 'path'

/////////////////////////////
// EXPERIMENTAL VERSIONING //
/////////////////////////////

// region Version
/**
 * @description ### **`INTERNAL USE ONLY`**
 */
export interface Version {
  path: string
  uuid: string
  sem_version: SemVersion.Primitive
  format: Version.Format
}

export namespace Version {
  // region Version.Format
  export enum Format {
    Release = 0,
    Beta = 1,
    Preview = 2
  }

  export namespace Format {
    export const Schema: JSONSchemaType<Format> = {
      type: 'number',
      enum: [0, 1, 2]
    }

    export const Validator = AJV_Instance.compile<Format>(Schema)
  }
  // endregion

  export function toString(data: Version) {
    return `${data.sem_version}${['', '-beta', '-preview'][data.format]}`
  }

  export const Schema: JSONSchemaType<Version> = {
    type: 'object',
    properties: {
      path: { type: 'string' },
      uuid: { type: 'string', format: 'uuid' },
      sem_version: SemVersion.Primitive.Schema,
      format: Version.Format.Schema
    },
    required: ['path', 'uuid', 'sem_version', 'format']
  }

  export const Validator = AJV_Instance.compile<Version>(Schema)

  // region Version.Cached
  export interface Cached {
    uuid: string
    sem_version: SemVersion.Primitive
    format: Version.Format
  }

  export namespace Cached {
    export const Schema: JSONSchemaType<Cached> = {
      type: 'object',
      properties: {
        uuid: { type: 'string', format: 'uuid' },
        sem_version: SemVersion.Primitive.Schema,
        format: Version.Format.Schema
      },
      required: ['uuid', 'sem_version', 'format']
    }

    export const Validator = AJV_Instance.compile<Cached>(Schema)

    export function toString(data: Version.Cached) {
      return `${data.sem_version}${['', '-beta', '-preview'][data.format]}`
    }

    // region Version.Cached.File
    export type File = [string, string, number][]

    export namespace File {
      export const Schema: JSONSchemaType<File> = {
        type: 'array',
        items: {
          type: 'array',
          items: [{ type: 'string' }, { type: 'string' }, { type: 'number' }],
          minItems: 3,
          maxItems: 3
        }
      }

      export const Validator = AJV_Instance.compile<File>(Schema)
    }
    // endregion
  }
  // endregion

  // region Version.File
  export interface File {
    default_path: string
    tracking_paths: string[]
    versions: Version[]
  }

  export namespace File {
    export const Schema: JSONSchemaType<File> = {
      type: 'object',
      properties: {
        default_path: { type: 'string' },
        tracking_paths: {
          type: 'array',
          items: { type: 'string' }
        },
        versions: {
          type: 'array',
          items: Version.Schema
        }
      },
      required: ['default_path', 'tracking_paths', 'versions'],
      additionalProperties: false
    }

    export const Validator = AJV_Instance.compile<File>(Schema)
  }
  // endregion
}
// endregion

//////////////////////////////////////////////////

export async function FetchAvailableVersions() {
  let last_write_time: Date = new Date(0)

  if (fs.existsSync(FilePaths.CachedVersions)) {
    const file_stats = fs.statSync(FilePaths.CachedVersions)
    last_write_time = file_stats.mtime
  }

  // Only fetch the data every hour
  const current_time: Date = new Date()
  const discard_old_data: boolean = current_time.getTime() > last_write_time.getTime() + 3600000

  if (discard_old_data) {
    Console.StartGroup(Console.ActionStr('Fetch Versions'))
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
}

export function GetCachedVersions() {
  const text = fs.readFileSync(FilePaths.CachedVersions, 'utf-8')
  const json = JSON.parse(text)

  if (Version.Cached.File.Validator(json)) {
    return json.map(version => {
      return {
        sem_version: version[0],
        uuid: version[1],
        format: version[2]
      } as Version.Cached
    })
  } else {
    Console.Group(Console.ErrorStr('Failed to parse `cached_versions.json`'), () => {
      console.log(Version.Cached.File.Validator.errors)
    })

    return []
  }
}

export function FindCachedVersion(version: SemVersion.Primitive): Version.Cached | undefined {
  const cached_versions: Version.Cached[] = GetCachedVersions()
  return cached_versions.find(v => v.sem_version === version)
}

//////////////////////////////////////////////////

export function RefreshVersionsFile(): void {
  if (!fs.existsSync(FilePaths.Versions)) {
    const default_version_file: Version.File = {
      default_path: FolderPaths.Versions,
      tracking_paths: [],
      versions: []
    }

    const versions_file_string = JSON.stringify(default_version_file, undefined, 4)
    fs.writeFileSync(FilePaths.Versions, versions_file_string)
  }

  const versions = GetVersions().filter(v => {
    if (v.path) {
      return fs.existsSync(path.join(v.path, Version.toString(v)))
    }
    return false
  })

  if (fs.existsSync(FolderPaths.Versions)) {
    const version_dirs = fs
      .readdirSync(FolderPaths.Versions, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
    for (const version_dir of version_dirs) {
      const dir_path = path.join(version_dir.parentPath, version_dir.name)

      if (
        !versions
          .map(v => {
            if (v.path) {
              return path.join(v.path, Version.toString(v))
            }
          })
          .includes(dir_path)
      ) {
        const sem_version = SemVersion.Primitive.Match(version_dir.name)
        if (SemVersion.Primitive.Validator(sem_version)) {
          const minecraft_version = FindCachedVersion(sem_version)

          if (minecraft_version) {
            versions.push({ ...minecraft_version, path: dir_path })
          }
        } else {
          console.error(SemVersion.Primitive.Validator.errors)
        }
      }
    }
  }

  if (fs.existsSync(FilePaths.Versions)) {
    const version_file = GetVersionsFile()

    version_file.versions = versions

    fs.writeFileSync(FilePaths.Versions, JSON.stringify(version_file, undefined, 4))
  }
}

export function SetVersionsFile(file: Version.File) {
  if (Version.File.Validator(file)) {
    const text = JSON.stringify(file, undefined, 4)
    fs.writeFileSync(FilePaths.Versions, text)
  } else {
    console.error('Invalid Versions File')
    console.error(Version.File.Validator.errors)
  }
}

export function GetVersionsFile(): Version.File {
  if (fs.existsSync(FilePaths.Versions)) {
    const text = fs.readFileSync(FilePaths.Versions, 'utf-8')
    const json = JSON.parse(text)

    if (Version.File.Validator(json)) {
      return json as Version.File
    } else {
      Console.Group(Console.ErrorStr('Failed to parse `versions.json`'), () => {
        console.log(Version.File.Validator.errors)
      })
    }
  }

  return {
    default_path: FolderPaths.Versions,
    tracking_paths: [],
    versions: []
  }
}

export function GetVersions(): Version[] {
  return GetVersionsFile().versions
}

export function GetDefaultVersionPath(): string {
  return GetVersionsFile().default_path
}

export function FindVersionPath(version: Version): string | undefined {
  return GetVersions().find(v => {
    return v.uuid === version.uuid
  })?.path
}

export function GetLatestVersion(format: Version.Format = Version.Format.Release): Version.Cached {
  const versions = GetCachedVersions().filter(v => v.format === format)

  return versions[versions.length - 1]
}
