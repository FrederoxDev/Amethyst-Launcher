import { FilePaths, ValidatePath } from '../Paths'
import AJV_Instance from '../schemas/AJV_Instance'
import { Console } from './Console'
import { Version } from './Version'
import Shard from './Shard'

import { JSONSchemaType } from 'ajv'
import * as fs from 'fs'

// region Profile
export interface Profile {
  name: string
  version: Version.Local
  runtime?: Shard.Fragment
  mods?: Shard.Fragment[],
  icon_path?: string
}

export namespace Profile {
  export const Schema: JSONSchemaType<Profile> = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      version: Version.Local.Schema,
      runtime: { oneOf: [Shard.Fragment.Schema], nullable: true },
      mods: {
        type: 'array',
        items: Shard.Fragment.Schema,
        nullable: true
      },
      icon_path: { type: 'string', nullable: true }
    },
    required: ['name', 'version'],
    additionalProperties: false
  }

  export const Validator = AJV_Instance.compile<Profile>(Schema)

  // region Profile.File
  export type File = Profile[]

  export namespace File {
    export const Schema: JSONSchemaType<File> = {
      type: 'array',
      items: Profile.Schema
    }

    export const Validator = AJV_Instance.compile<File>(Schema)
  }
  // endregion
}
// endregion Profile

export function GetProfiles(): Profile[] {
  if (!fs.existsSync(FilePaths.Profiles)) return []

  const text = fs.readFileSync(FilePaths.Profiles, 'utf-8')

  const json = JSON.parse(text)
  if (Profile.File.Validator(json)) {
    return json
  }
  else {
    Console.Group(Console.ErrorStr('Failed to parse `profiles.json`'), () => {
      console.log(Profile.File.Validator.errors)
    })

    return []
  }
}

export function SetProfiles(profiles: Profile[]) {
  ValidatePath(FilePaths.Profiles)

  if (Profile.File.Validator(profiles)) {
    fs.writeFileSync(FilePaths.Profiles, JSON.stringify(profiles, undefined, 4))
  }
  else {
    Console.Group(Console.ErrorStr('Failed to set `profiles.json`'), () => {
      console.log(Profile.File.Validator.errors)
    })
  }
}
