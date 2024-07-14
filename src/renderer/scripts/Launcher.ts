import { LauncherConfigFile } from './Paths'

import * as fs from 'fs'
import * as path from 'path'

export interface LauncherConfig {
  runtime: string
  mods: string[]
  developer_mode: boolean
  keep_open: boolean
  selected_profile: number
  ui_theme: string
}

export function GetLauncherConfig(): LauncherConfig {
  let data: Partial<LauncherConfig> = {}

  try {
    const jsonData = fs.readFileSync(LauncherConfigFile, 'utf-8')
    data = JSON.parse(jsonData)
  } catch {
    console.error(`Failed to read/parse the launcherConfig file`)
  }

  return {
    keep_open: true,
    developer_mode: false,
    ui_theme: 'System',
    mods: [],
    runtime: 'Vanilla',
    selected_profile: 0,
    ...data
  }
}

export function SetLauncherConfig(config: LauncherConfig) {
  fs.mkdirSync(path.dirname(LauncherConfigFile), { recursive: true })
  fs.writeFileSync(LauncherConfigFile, JSON.stringify(config, undefined, 4))
}
