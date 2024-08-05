import { FilePaths } from './Paths'

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
    const text = fs.readFileSync(FilePaths.RuntimeConfig, 'utf-8')
    data = JSON.parse(text)
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
  fs.mkdirSync(path.dirname(FilePaths.RuntimeConfig), { recursive: true })
  fs.writeFileSync(FilePaths.RuntimeConfig, JSON.stringify(config, undefined, 4))
}
