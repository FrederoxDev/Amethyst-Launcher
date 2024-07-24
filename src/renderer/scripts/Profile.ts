import { ValidatePath, ProfilesFile } from './Paths'
import { Version, Version_Schema } from './Versioning'
import AJV_Instance from './AJV_Instance'
import { Mod } from './Mod'

import { JSONSchemaType } from 'ajv'
import * as fs from 'fs'

// region Profile
export interface Profile {
  name: string
  version: Version
  runtime: Mod
  mods: Mod[]
}

export namespace Profile {
  export const Schema: JSONSchemaType<Profile> = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      version: Version_Schema,
      runtime: Mod.Schema,
      mods: {
        type: 'array',
        items: Mod.Schema
      }
    },
    required: ['name', 'version', 'runtime', 'mods'],
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

  const json_data = fs.readFileSync(ProfilesFile, 'utf-8')
  try {
    return JSON.parse(json_data)
  } catch {
    return []
  }
}

export function SetProfiles(profiles: Profile[]) {
  ValidatePath(ProfilesFile)
  fs.writeFileSync(ProfilesFile, JSON.stringify(profiles, undefined, 4))
}
