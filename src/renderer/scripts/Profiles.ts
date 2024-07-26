import { FilePaths, ValidatePath } from './Paths'

import * as fs from 'fs'

export interface Profile {
  name: string
  runtime: string
  mods: string[]
  minecraft_version: string
}

export function GetProfiles(): Profile[] {
  if (!fs.existsSync(FilePaths.Profiles)) return []

  const json_data = fs.readFileSync(FilePaths.Profiles, 'utf-8')
  try {
    return JSON.parse(json_data)
  } catch {
    return []
  }
}

export function SetProfiles(profiles: Profile[]) {
  ValidatePath(FilePaths.Profiles)
  fs.writeFileSync(FilePaths.Profiles, JSON.stringify(profiles, undefined, 4))
}
