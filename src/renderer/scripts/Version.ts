import { JSONSchemaType } from 'ajv'

import { SemVersion } from './SemVersion'
import { VersionsFile, VersionsFolder } from './Paths'
import * as fs from 'node:fs'
import { CachedVersionsFile } from './Paths'
import { Console } from './Console'
import AJV_Instance from './AJV_Instance'

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

// region VersionsJSON
export interface VersionsJSON {
  default_path: string
  versions: Version.Fragment[]
}
export namespace VersionsJSON {
  export const Schema: JSONSchemaType<VersionsJSON> = {
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

  export const Validator = AJV_Instance.compile<VersionsJSON>(VersionsJSON.Schema)
}
// endregion

//////////////////////////////////////////////////

export function ValidateVersionsFile() {
  const text = fs.readFileSync(VersionsFile, { encoding: 'utf8' })
  const json = JSON.parse(text)

  VersionsJSON.Validator(json)
}

//////////////////////////////////////////////////

export async function FetchAvailableVersionData() {
  let last_write_time: Date = new Date(0)

  if (fs.existsSync(CachedVersionsFile)) {
    const file_stats = fs.statSync(CachedVersionsFile)
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
            fs.writeFileSync(CachedVersionsFile, await data.text())
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

export function GetAvailableVersionData() {
  const text = fs.readFileSync(CachedVersionsFile, 'utf-8')
  const json = JSON.parse(text)
  const versions: Version[] = []

  for (const version of json) {
    versions.push({
      sem_version: SemVersion.fromPrimitive(version[0] as string),
      uuid: version[1] as string,
      format: version[2] as Version.Format
    })
  }

  return versions
}

//////////////////////////////////////////////////

export function GetVersionsFile(): VersionsJSON {
  if (fs.existsSync(VersionsFile)) {
    const text = fs.readFileSync(VersionsFile, 'utf-8')
    const json = JSON.parse(text)
    console.log(json)
  }

  return {
    versions: [],
    default_path: VersionsFolder
  }
}

export function GetVersions(): Version.Fragment[] {
  return GetVersionsFile().versions
}

export function GetDefaultVersionPath(): string {
  return GetVersionsFile().default_path
}
