import { FolderPaths, FilePaths } from '../Paths'
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
  uuid: string
  sem_version: SemVersion
  format: Version.Format
}

export namespace Version {
  export function toString(data: Version) {
    return `${SemVersion.toPrimitive(data.sem_version)}${['', '-beta', '-preview'][data.format]}`
  }

  // region Version.Fragment
  export interface Fragment {
    uuid: string
    path: string
  }

  export namespace Fragment {
    export const Schema: JSONSchemaType<Fragment> = {
      type: 'object',
      properties: {
        uuid: { type: 'string', format: 'uuid' },
        path: { type: 'string' }
      },
      required: ['uuid', 'path'],
      additionalProperties: false
    }

    export const Validator = AJV_Instance.compile<Fragment>(Schema)
  }
  // endregion

  // region Version.Cached
  export type Cached = [string, string, number]

  export namespace Cached {
    export const Schema: JSONSchemaType<Cached> = {
      type: 'array',
      items: [{type: 'string'}, {type: 'string'}, {type: 'number'}],
      minItems: 3,
      maxItems: 3
    }

    export const Validator = AJV_Instance.compile<Cached>(Schema)

    // region Version.Cached.File
    export type File = Cached[]

    export namespace File {
      export const Schema: JSONSchemaType<File> = {
        type: 'array',
        items: Cached.Schema
      }

      export const Validator = AJV_Instance.compile<File>(Schema)
    }
    // endregion
  }
  // endregion

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

  // region Version.Local
  export interface Local {
    path: string,
    uuid: string,
    sem_version: SemVersion.Primitive,
    format: Format
  }

  export namespace Local {
    export const Schema: JSONSchemaType<Local> = {
      type: 'object',
      properties: {
        path: { type: 'string' },
        uuid: { type: 'string', format: 'uuid' },
        sem_version: SemVersion.Primitive.Schema,
        format: Format.Schema
      },
      required: ['path', 'uuid', 'sem_version', 'format'],
      additionalProperties: false
    }

    export const Validator = AJV_Instance.compile<Local>(Schema)
  }
  // endregion

  // region Version.File
  export interface File {
    default_path: string
    versions: Local[]
  }

  export namespace File {
    export const Schema: JSONSchemaType<File> = {
      type: 'object',
      properties: {
        default_path: { type: 'string' },
        versions: {
          type: 'array',
          items: Local.Schema
        }
      },
      required: ['default_path', 'versions'],
      additionalProperties: false
    }

    export const Validator = AJV_Instance.compile<File>(Schema)
  }
  // endregion
}
// endregion

//////////////////////////////////////////////////

export function ValidateVersionsFile() {
  const text = fs.readFileSync(FilePaths.Versions, { encoding: 'utf8' })
  const json = JSON.parse(text)

  Version.File.Validator(json)
}

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
        sem_version: SemVersion.fromPrimitive(version[0]),
        uuid: version[1],
        format: version[2]
      } as Version
    })
  }
  else {
    Console.Group(Console.ErrorStr('Failed to parse `cached_versions.json`'), () => {
      console.log(Version.Cached.File.Validator.errors)
    })

    return []
  }
}

export function FindCachedVersion(uuid: string): Version | undefined
export function FindCachedVersion(version: SemVersion): Version | undefined
export function FindCachedVersion(from: string | SemVersion): Version | undefined {
  const cached_versions: Version[] = GetCachedVersions()

  if (typeof from === 'string') {
    return cached_versions.find(v => v.uuid === from)
  }
  else {
    return cached_versions.find(v => SemVersion.toPrimitive(v.sem_version) === SemVersion.toPrimitive(from))
  }
}

//////////////////////////////////////////////////

export function RefreshVersionsFile() {
  if (!fs.existsSync(FilePaths.Versions)) {
    const default_version_file: Version.File = {
      versions: [],
      default_path: FolderPaths.Versions
    }

    const versions_file_string = JSON.stringify(default_version_file, undefined, 4)
    fs.writeFileSync(FilePaths.Versions, versions_file_string)
  }

  const versions = GetVersions().filter(v => {
    fs.existsSync(v.path)
  })

  if (fs.existsSync(FolderPaths.Versions)) {
    const version_dirs = fs.readdirSync(FolderPaths.Versions, { withFileTypes: true }).filter(entry => entry.isDirectory())
    for (const version_dir of version_dirs) {
      const dir_path = path.join(version_dir.parentPath, version_dir.name)

      if (!(versions.map(v => { return v.path }).includes(dir_path))) {
        if (version_dir.name.startsWith('Minecraft-')) {
          const sem_version = SemVersion.fromPrimitive(version_dir.name.slice('Minecraft-'.length))

          const minecraft_version = FindCachedVersion(sem_version)

          if (minecraft_version) {
            versions.push({ path: dir_path, uuid: minecraft_version.uuid, sem_version: SemVersion.toPrimitive(minecraft_version.sem_version), format: minecraft_version.format })
          }
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

export function GetVersionsFile(): Version.File {
  if (fs.existsSync(FilePaths.Versions)) {
    const text = fs.readFileSync(FilePaths.Versions, 'utf-8')
    const json = JSON.parse(text)

    if (Version.File.Validator(json)) {
      return json as Version.File
    }
    else {
      Console.Group(Console.ErrorStr('Failed to parse `versions.json`'), () => {
        console.log(Version.File.Validator.errors)
      })

      return {
        versions: [],
        default_path: FolderPaths.Versions
      }
    }
  }

  return {
    versions: [],
    default_path: FolderPaths.Versions
  }
}

export function GetVersions(): Version.Local[] {
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
