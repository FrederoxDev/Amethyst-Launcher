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
export interface Version {
  uuid: string
  path: string
}

export namespace Version {
  export const Schema: JSONSchemaType<Version> = {
    type: 'object',
    properties: {
      uuid: { type: 'string' },
      path: { type: 'string' }
    },
    required: ['uuid', 'path'],
    additionalProperties: false
  }
}
// endregion

export enum VersionType {
  Release = 0,
  Beta = 1,
  Preview = 2
}

// region VersionData
export interface VersionData {
  uuid: string
  sem_version: SemVersion
  type: VersionType
}

export namespace VersionData {
  export function toString(data: VersionData) {
    return `${SemVersion.toPrimitive(data.sem_version)}${['', '-beta', '-preview'][data.type]}`
  }
}
// endregion

// region VersionsFileData
export interface VersionsFileData {
  default_path: string
  versions: Version[]
}
export namespace VersionsFileData {
  export const Schema: JSONSchemaType<VersionsFileData> = {
    type: 'object',
    properties: {
      default_path: { type: 'string' },
      versions: {
        type: 'array',
        items: Version.Schema
      }
    },
    required: ['default_path', 'versions'],
    additionalProperties: false
  }

  export const Validator = AJV_Instance.compile<VersionsFileData>(Schema)
}
// endregion

//////////////////////////////////////////////////

export function ValidateVersionsFile() {
  const text = fs.readFileSync(VersionsFile, { encoding: 'utf8' })
  const json = JSON.parse(text)

  VersionsFileData.Validator(json)
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
  const versions: VersionData[] = []

  for (const version of json) {
    versions.push({
      sem_version: SemVersion.fromPrimitive(version[0] as string),
      uuid: version[1] as string,
      type: version[2] as VersionType
    })
  }

  return versions
}

//////////////////////////////////////////////////

export function GetVersionsFile(): VersionsFileData {
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

export function GetVersions(): Version[] {
  return GetVersionsFile().versions
}

export function GetDefaultVersionPath(): string {
  return GetVersionsFile().default_path
}
