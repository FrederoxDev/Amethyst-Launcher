import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'

import { GetCachedVersions, Version } from '../scripts/types/Version'

import { GetProfiles, Profile, SetProfiles as SetProfilesFile } from '../scripts/types/Profile'

import { ipcRenderer } from 'electron'
import Shard, { FindExtraShard, FindExtraShards, GetExtraShards } from '../scripts/types/Shard'
import { Config, ProxyConfig } from '../scripts/types/Config'
import path from 'path'

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

  index$profile_editor: number | undefined
  SetIndex$ProfileEditor: React.Dispatch<React.SetStateAction<number | undefined>>

  theme: string
  SetTheme: React.Dispatch<React.SetStateAction<'Light' | 'Dark' | 'System'>>

  developer_mode: boolean
  SetDeveloperMode: React.Dispatch<React.SetStateAction<boolean>>

  active_profile: number | undefined
  SetActiveProfile: React.Dispatch<React.SetStateAction<number | undefined>>

  loading_percent: number
  SetLoadingPercent: React.Dispatch<React.SetStateAction<number>>

  is_loading: boolean
  SetIsLoading: React.Dispatch<React.SetStateAction<boolean>>

  status: string
  SetStatus: React.Dispatch<React.SetStateAction<string>>

  error: string
  SetError: React.Dispatch<React.SetStateAction<string>>

  config: Config
  runtime_config: ProxyConfig

  // Expose functions
  SaveState: () => void

  UpdateRuntimeConfig: (profile: Profile) => void
}

const AppStateContext = createContext<TAppStateContext | undefined>(undefined)

export const AppStateProvider = ({ children }: { children: ReactNode }) => {
  // CACHE
  const [mods, SetMods] = useState<Shard.Extra[]>([])
  const [runtimes, SetRuntimes] = useState<Shard.Extra[]>([])
  const [shards, SetShards] = useState<Shard.Extra[]>(GetExtraShards)
  const [versions, SetVersions] = useState<Version.Cached[]>(GetCachedVersions)
  const [profiles, SetProfiles] = useState<Profile[]>(GetProfiles)

  // PROFILE EDITOR
  const [index$profile_editor, SetIndex$ProfileEditor] = useState<number | undefined>(undefined)

  // CONFIG
  const [theme, SetTheme] = useState<'Light' | 'Dark' | 'System'>('System')
  const [developer_mode, SetDeveloperMode] = useState<boolean>(false)
  const [active_profile, SetActiveProfile] = useState<number | undefined>(undefined)

  // STATUS
  const [loading_percent, SetLoadingPercent] = useState<number>(0)
  const [is_loading, SetIsLoading] = useState<boolean>(false)
  const [status, SetStatus] = useState<string>('')
  const [error, SetError] = useState<string>('')

  const [config, SetConfig] = useState<Config>(Config.Get)
  const [runtime_config, SetRuntimeConfig] = useState<ProxyConfig>(RuntimeConfig.Get)

  // Initialize Data like all mods and existing profiles
  useEffect(() => {
    SetRuntimes(shards.filter(s => s.manifest.meta.format === 1))
    SetMods(shards.filter(s => s.manifest.meta.format === 0 || s.manifest.meta.format === undefined))

    SetDeveloperMode(config.developer_mode)
    SetActiveProfile(config.active_profile)
    SetTheme(config.theme)
  }, [config.active_profile, config.developer_mode, config.theme, shards])

  const [initialized, SetInitialized] = useState(false)

  const SaveState = useCallback(() => {
    SetProfilesFile(profiles)

    const config: Config = {
      theme: theme,
      active_profile: active_profile,
      developer_mode: developer_mode
    }

    Config.Set(config)
    SetConfig(config)
  }, [profiles, active_profile, developer_mode, theme])

  const UpdateRuntimeConfig = useCallback((profile: Profile) => {
    let profile_mods: string[] = []
    let profile_runtime: string = 'Vanilla'

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

    const runtime_config: ProxyConfig = {
      developer_mode: developer_mode,
      runtime: profile_runtime,
      mods: profile_mods
    }

    RuntimeConfig.Set(runtime_config)
    SetRuntimeConfig(RuntimeConfig.Get)
  }, [developer_mode])

  useEffect(() => {
    if (!initialized) {
      SetInitialized(true)
      return
    }

    SaveState()
  }, [profiles, active_profile, developer_mode, initialized, SaveState])

  useEffect(() => {
    if (active_profile && profiles[active_profile] === undefined) {
      if (profiles.length > 0) {
        SetActiveProfile(profiles.length - 1)
      } else {
        SetActiveProfile(undefined)
      }
    }
  }, [active_profile, profiles])

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

        index$profile_editor: index$profile_editor,
        SetIndex$ProfileEditor: SetIndex$ProfileEditor,

        theme: theme,
        SetTheme: SetTheme,
        developer_mode: developer_mode,
        SetDeveloperMode: SetDeveloperMode,
        active_profile: active_profile,
        SetActiveProfile: SetActiveProfile,

        loading_percent: loading_percent,
        SetLoadingPercent: SetLoadingPercent,
        is_loading: is_loading,
        SetIsLoading: SetIsLoading,
        status,
        SetStatus: SetStatus,
        SaveState: SaveState,
        error: error,
        SetError: SetError,

        config: config,
        runtime_config: runtime_config,

        UpdateRuntimeConfig: UpdateRuntimeConfig
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
