import { ValidatePath, ProfilesFile } from './Paths'
import AJV_Instance from './AJV_Instance'
import { Console } from './Console'
import { Version } from './Version'
import { Shard } from './Shard'

import { JSONSchemaType } from 'ajv'
import * as fs from 'fs'

// region Profile
export interface Profile {
  name: string
  version: Version.Fragment
  icon_path?: string
  runtime?: Shard.Fragment
  mods?: Shard.Fragment[]
}

export namespace Profile {
  export const Schema: JSONSchemaType<Profile> = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      version: Version.Fragment.Schema,
      icon_path: { type: 'string', nullable: true },
      runtime: { oneOf: [Shard.Fragment.Schema], nullable: true },
      mods: {
        type: 'array',
        items: Shard.Fragment.Schema,
        nullable: true
      }
    },
    required: ['name', 'version'],
    additionalProperties: false
  }

  export const Validator = AJV_Instance.compile<Profile>(Schema)
}
// endregion Profile

// region ProfilesJSON
export type ProfilesJSON = Profile[]

export namespace ProfilesJSON {
  export const Schema: JSONSchemaType<ProfilesJSON> = {
    type: 'array',
    items: Profile.Schema
  }

  export const Validator = AJV_Instance.compile<ProfilesJSON>(Schema)
}
// endregion ProfilesJSON

export function GetProfiles(): Profile[] {
  if (!fs.existsSync(ProfilesFile)) return []

  const text = fs.readFileSync(ProfilesFile, 'utf-8')

  const json = JSON.parse(text)
  if (ProfilesJSON.Validator(json)) {
    return json
  }
  else {
    Console.Group(Console.ErrorStr('Failed to parse `profiles.json`'), () => {
      console.log(ProfilesJSON.Validator.errors)
    })

    return []
  }
}

export function SetProfiles(profiles: Profile[]) {
  ValidatePath(ProfilesFile)

  if (ProfilesJSON.Validator(profiles)) {
    fs.writeFileSync(ProfilesFile, JSON.stringify(profiles, undefined, 4))
  }
  else {
    Console.Group(Console.ErrorStr('Failed to set `profiles.json`'), () => {
      console.log(ProfilesJSON.Validator.errors)
    })
  }
}
