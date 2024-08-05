import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'

import { GetCachedVersions, Version } from '../scripts/types/Version'

import { GetProfiles, Profile, SetProfiles as SetProfilesFile } from '../scripts/types/Profile'

import { ipcRenderer } from 'electron'
import Shard, { FindExtraShard, FindExtraShards, GetExtraShards } from '../scripts/types/Shard'

import * as path from 'path'
import { Config, RuntimeConfig } from '../scripts/types/Config'

interface TAppStateContext {
  mods: Shard.Extra[]
  SetMods: React.Dispatch<React.SetStateAction<Shard.Extra[]>>

  runtimes: Shard.Extra[]
  SetRuntimes: React.Dispatch<React.SetStateAction<Shard.Extra[]>>

  shards: Shard.Extra[]
  SetShards: React.Dispatch<React.SetStateAction<Shard.Extra[]>>

  versions: Version.Cached[]
  SetVersions: React.Dispatch<React.SetStateAction<Version.Cached[]>>

  profiles: Profile[]
  SetProfiles: React.Dispatch<React.SetStateAction<Profile[]>>

  theme: string
  SetTheme: React.Dispatch<React.SetStateAction<'Light' | 'Dark' | 'System'>>

  developer_mode: boolean
  SetDeveloperMode: React.Dispatch<React.SetStateAction<boolean>>

  active_profile: number | undefined
  SetActiveProfile: React.Dispatch<React.SetStateAction<number | undefined>>

  show_all_versions: boolean
  SetShowAllVersions: React.Dispatch<React.SetStateAction<boolean>>

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
  const [versions, SetVersions] = useState<Version.Cached[]>([])
  const [profiles, SetProfiles] = useState<Profile[]>([])
  const [theme, SetTheme] = useState<'Light' | 'Dark' | 'System'>('System')
  const [developer_mode, SetDeveloperMode] = useState<boolean>(false)
  const [active_profile, SetActiveProfile] = useState<number | undefined>(undefined)
  const [show_all_versions, SetShowAllVersions] = useState<boolean>(false)
  const [loading_percent, SetLoadingPercent] = useState<number>(0)
  const [is_loading, SetIsLoading] = useState<boolean>(false)
  const [status, SetStatus] = useState<string>('')
  const [error, SetError] = useState<string>('')

  // Initialize Data like all mods and existing profiles
  useEffect(() => {
    SetProfiles(GetProfiles())

    const shards = GetExtraShards()

    SetShards(shards)
    SetRuntimes(shards.filter(s => s.manifest.meta.format === 1))
    SetMods(shards.filter(s => s.manifest.meta.format === 0 || s.manifest.meta.format === undefined))

    const config = Config.Get()

    SetDeveloperMode(config.developer_mode)
    SetActiveProfile(config.active_profile)
    SetTheme(config.theme)

    SetVersions(GetCachedVersions())
  }, [])

  const [initialized, SetInitialized] = useState(false)

  const SaveState = useCallback(() => {
    SetProfilesFile(profiles)

    let profile_mods: string[] = []
    let profile_runtime: string = 'Vanilla'

    if (active_profile) {
      const profile = profiles[active_profile]
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

    const config: Config = {
      theme: theme,
      active_profile: active_profile,
      developer_mode: developer_mode,
      show_all_versions: show_all_versions
    }

    const runtime_config: RuntimeConfig = {
      developer_mode: developer_mode,
      runtime: profile_runtime,
      mods: profile_mods
    }

    Config.Set(config)
    RuntimeConfig.Set(runtime_config)
  }, [profiles, active_profile, developer_mode, theme, show_all_versions])

  useEffect(() => {
    if (!initialized) {
      SetInitialized(true)
      return
    }

    SaveState()
  }, [profiles, active_profile, developer_mode, initialized, SaveState])

  useEffect(() => {
    ipcRenderer.send('WINDOW_UI_THEME', theme)
  }, [theme])

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

        theme: theme,
        SetTheme: SetTheme,
        developer_mode: developer_mode,
        SetDeveloperMode: SetDeveloperMode,
        active_profile: active_profile,
        SetActiveProfile: SetActiveProfile,
        show_all_versions: show_all_versions,
        SetShowAllVersions: SetShowAllVersions,

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
