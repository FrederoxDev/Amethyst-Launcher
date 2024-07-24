import AJV, { JSONSchemaType } from 'ajv'

import { SemVersion } from './classes/SemVersion'
import * as Paths from './Paths'
import * as fs from 'node:fs'
import { CachedVersionsFile } from './Paths'
import { Console } from './Console'

/////////////////////////////
// EXPERIMENTAL VERSIONING //
/////////////////////////////

export interface Version {
  uuid: string
  path: string
}

export interface VersionData {
  uuid: string
  sem_version: SemVersion
  type: VersionType
}

export namespace VersionData {
  export function toString(data: VersionData) {
    return `${SemVersion.toString(data.sem_version)}${['', '-beta', '-preview'][data.type]}`
  }
}

export enum VersionType {
  Release = 0,
  Beta = 1,
  Preview = 2
}

export interface VersionsFile {
  default_path: string
  versions: Version[]
}

// region JSON Schemas
export const Version_Schema: JSONSchemaType<Version> = {
  type: 'object',
  properties: {
    uuid: {
      type: 'string',
      nullable: false
    },
    path: {
      type: 'string',
      nullable: false
    }
  },
  required: ['uuid', 'path'],
  additionalProperties: false
}

export const VersionsFile_Schema: JSONSchemaType<VersionsFile> = {
  type: 'object',
  properties: {
    default_path: {
      type: 'string',
      nullable: false
    },
    versions: {
      type: 'array',
      nullable: false,
      items: Version_Schema
    }
  },
  required: ['default_path', 'versions'],
  additionalProperties: false
}
// endregion

const JSON_Validator = new AJV({ allErrors: true })
export const VersionsFile_Validator = JSON_Validator.compile<VersionsFile>(VersionsFile_Schema)

export function ValidateVersionsFile() {
  const text = fs.readFileSync(Paths.VersionsFile, { encoding: 'utf8' })
  const json = JSON.parse(text)

  VersionsFile_Validator(json)
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
    Console.StartGroup(
      Console.ActionStr('Fetching Versions')
    )
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
      sem_version: SemVersion.fromString(version[0] as string),
      uuid: version[1] as string,
      type: version[2] as VersionType
    })
  }

  return versions
}
