import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'

import { Version, GetCachedVersions } from '../scripts/types/Version'

import { LauncherConfig, GetLauncherConfig, SetLauncherConfig } from '../scripts/Launcher'
import { GetProfiles, SetProfiles as SetProfilesFile, Profile } from '../scripts/types/Profile'

import { ipcRenderer } from 'electron'
import Shard, { FindExtraShard, FindExtraShards, GetExtraShards } from '../scripts/types/Shard'

import * as path from 'path'

interface TAppStateContext {
  mods: Shard.Extra[]
  SetMods: React.Dispatch<React.SetStateAction<Shard.Extra[]>>

  runtimes: Shard.Extra[]
  SetRuntimes: React.Dispatch<React.SetStateAction<Shard.Extra[]>>

  shards: Shard.Extra[],
  SetShards: React.Dispatch<React.SetStateAction<Shard.Extra[]>>

  versions: Version[]
  SetVersions: React.Dispatch<React.SetStateAction<Version[]>>

  profiles: Profile[]
  SetProfiles: React.Dispatch<React.SetStateAction<Profile[]>>

  selected_profile: number
  SetSelectedProfile: React.Dispatch<React.SetStateAction<number>>

  ui_theme: string
  SetUITheme: React.Dispatch<React.SetStateAction<string>>

  keep_launcher_open: boolean
  SetKeepLauncherOpen: React.Dispatch<React.SetStateAction<boolean>>

  developer_mode: boolean
  SetDeveloperMode: React.Dispatch<React.SetStateAction<boolean>>

  loading_percent: number
  SetLoadingPercent: React.Dispatch<React.SetStateAction<number>>

  is_loading: boolean
  SetIsLoading: React.Dispatch<React.SetStateAction<boolean>>

  status: string
  SetStatus: React.Dispatch<React.SetStateAction<string>>

  error: string
  SetError: React.Dispatch<React.SetStateAction<string>>

  // Expose functions
  SaveState: () => void
}

const AppStateContext = createContext<TAppStateContext | undefined>(undefined)

export const AppStateProvider = ({ children }: { children: ReactNode }) => {
  const [mods, SetMods] = useState<Shard.Extra[]>([])
  const [runtimes, SetRuntimes] = useState<Shard.Extra[]>([])
  const [shards, SetShards] = useState<Shard.Extra[]>([])
  const [versions, SetVersions] = useState<Version[]>([])
  const [profiles, SetProfiles] = useState<Profile[]>([])
  const [selected_profile, SetSelectedProfile] = useState(0)
  const [ui_theme, SetUITheme] = useState('System')
  const [keep_launcher_open, SetKeepLauncherOpen] = useState(true)
  const [developer_mode, SetDeveloperMode] = useState(false)
  const [loading_percent, SetLoadingPercent] = useState(0)
  const [is_loading, SetIsLoading] = useState(false)
  const [status, SetStatus] = useState('')
  const [error, SetError] = useState('')

  // Initialize Data like all mods and existing profiles
  useEffect(() => {
    SetProfiles(GetProfiles())

    const shards = GetExtraShards()

    SetShards(shards)
    SetRuntimes(shards.filter(s => s.manifest.meta.format === 1))
    SetMods(shards.filter(s => s.manifest.meta.format === 0 || s.manifest.meta.format === undefined))

    const launcher_config = GetLauncherConfig()
    SetKeepLauncherOpen(launcher_config.keep_open ?? true)
    SetDeveloperMode(launcher_config.developer_mode ?? false)
    SetSelectedProfile(launcher_config.selected_profile ?? 0)
    SetUITheme(launcher_config.ui_theme ?? 'Light')

    SetVersions(GetCachedVersions())
  }, [])

  const [initialized, SetInitialized] = useState(false)

  const SaveState = useCallback(() => {
    SetProfilesFile(profiles)

    let profile_mods: string[] = []
    let profile_runtime: string = 'Vanilla'

    const profile = profiles[selected_profile]

    if (profile) {
      if (profile.mods) {
        const mod_shards = FindExtraShards(profile.mods)

        profile_mods = mod_shards.map(m => path.basename(m.path))
      }

      if (profile.runtime) {
        const found = FindExtraShard(profile.runtime)

        if (found) {
          profile_runtime = path.basename(found.path)
        }
      }
    }


    const launcherConfig: LauncherConfig = {
      developer_mode: developer_mode,
      keep_open: keep_launcher_open,
      mods: profile_mods,
      runtime: profile_runtime,
      selected_profile: selected_profile,
      ui_theme: ui_theme
    }

    SetLauncherConfig(launcherConfig)
  }, [profiles, developer_mode, keep_launcher_open, selected_profile, ui_theme])

  useEffect(() => {
    if (!initialized) {
      SetInitialized(true)
      return
    }

    SaveState()
  }, [profiles, selected_profile, keep_launcher_open, developer_mode, initialized, SaveState])

  useEffect(() => {
    ipcRenderer.send('WINDOW_UI_THEME', ui_theme)
  }, [ui_theme])

  return (
    <AppStateContext.Provider
      value={{
        mods: mods,
        SetMods: SetMods,
        runtimes: runtimes,
        SetRuntimes: SetRuntimes,
        shards: shards,
        SetShards: SetShards,
        versions: versions,
        SetVersions: SetVersions,
        profiles: profiles,
        SetProfiles: SetProfiles,
        selected_profile: selected_profile,
        SetSelectedProfile: SetSelectedProfile,
        ui_theme: ui_theme,
        SetUITheme: SetUITheme,
        keep_launcher_open: keep_launcher_open,
        SetKeepLauncherOpen: SetKeepLauncherOpen,
        developer_mode: developer_mode,
        SetDeveloperMode: SetDeveloperMode,
        loading_percent: loading_percent,
        SetLoadingPercent: SetLoadingPercent,
        is_loading: is_loading,
        SetIsLoading: SetIsLoading,
        status,
        SetStatus: SetStatus,
        SaveState: SaveState,
        error: error,
        SetError: SetError
      }}
    >
      {children}
    </AppStateContext.Provider>
  )
}

export function UseAppState() {
  const context = useContext(AppStateContext)
  if (!context) throw new Error('useAppState must be used within a MyProvider')
  return context
}
