import { FolderPaths, FilePaths } from '../Paths'
import { SemVersion } from './SemVersion'
import { Console } from './Console'

import AJV_Instance from '../schemas/AJV_Instance'
import { JSONSchemaType } from 'ajv'
import * as fs from 'node:fs'

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

  // region Version.File
  export interface File {
    default_path: string
    versions: Version.Fragment[]
  }

  export namespace File {
    export const Schema: JSONSchemaType<Version.File> = {
      type: 'object',
      properties: {
        default_path: { type: 'string' },
        versions: {
          type: 'array',
          items: Version.Fragment.Schema
        }
      },
      required: ['default_path', 'versions'],
      additionalProperties: false
    }

    export const Validator = AJV_Instance.compile<Version.File>(Version.File.Schema)
  }
  // endregion

  // region Version.Fragment
  export interface Fragment {
    uuid: string
    path: string
  }

  export namespace Fragment {
    export const Schema: JSONSchemaType<Version.Fragment> = {
      type: 'object',
      properties: {
        uuid: { type: 'string', format: 'uuid' },
        path: { type: 'string' }
      },
      required: ['uuid', 'path'],
      additionalProperties: false
    }

    export const Validator = AJV_Instance.compile<Version.Fragment>(Version.Fragment.Schema)
  }
  // endregion

  // region Version.Cached
  export type Cached = [string, string, number]

  export namespace Cached {
    export const Schema: JSONSchemaType<Version.Cached> = {
      type: 'array',
      items: [{type: 'string'}, {type: 'string'}, {type: 'number'}],
      minItems: 3,
      maxItems: 3
    }

    export const Validator = AJV_Instance.compile<Version.Cached>(Version.Cached.Schema)

    // region Version.Cached.File
    export type File = Version.Cached[]

    export namespace File {
      export const Schema: JSONSchemaType<Version.Cached.File> = {
        type: 'array',
        items: Version.Cached.Schema
      }

      export const Validator = AJV_Instance.compile<Version.Cached.File>(Version.Cached.File.Schema)
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
    export const Schema: JSONSchemaType<Version.Format> = {
      type: 'number',
      enum: [0, 1, 2]
    }

    export const Validator = AJV_Instance.compile<Version.Format>(Version.Format.Schema)
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

//////////////////////////////////////////////////

export function GetVersionsFile(): Version.File {
  if (fs.existsSync(FilePaths.Versions)) {
    const text = fs.readFileSync(FilePaths.Versions, 'utf-8')
    const json = JSON.parse(text)
    console.log(json)
  }

  return {
    versions: [],
    default_path: FolderPaths.Versions
  }
}

export function GetVersions(): Version.Fragment[] {
  return GetVersionsFile().versions
}

export function GetDefaultVersionPath(): string {
  return GetVersionsFile().default_path
}
