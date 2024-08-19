import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'

import { FetchAvailableVersions, GetCachedVersions, Version } from '../scripts/types/Version'

import { GetProfiles, Profile, SetProfiles as SetProfilesFile } from '../scripts/types/Profile'

import { ipcRenderer } from 'electron'
import Shard, { FindExtraShard, FindExtraShards, GetExtraShards, GetInvalidShards } from '../scripts/types/Shard'
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

  invalid_shards: Shard.Invalid[]
  SetInvalidShards: React.Dispatch<React.SetStateAction<Shard.Invalid[]>>

  index$profile_editor: number | undefined
  SetIndex$ProfileEditor: React.Dispatch<React.SetStateAction<number | undefined>>

  theme: string
  SetTheme: React.Dispatch<React.SetStateAction<'Light' | 'Dark' | 'System'>>

  developer_mode: boolean
  SetDeveloperMode: React.Dispatch<React.SetStateAction<boolean>>

  selected_profile: number | undefined
  SetSelectedProfile: React.Dispatch<React.SetStateAction<number | undefined>>

  registered_profile: number | undefined
  SetRegisteredProfile: React.Dispatch<React.SetStateAction<number | undefined>>

  loading_percent: number
  SetLoadingPercent: React.Dispatch<React.SetStateAction<number>>

  is_loading: boolean
  SetIsLoading: React.Dispatch<React.SetStateAction<boolean>>

  status: string
  SetStatus: React.Dispatch<React.SetStateAction<string>>

  error: string
  SetError: React.Dispatch<React.SetStateAction<string>>

  config: Config
  proxy_config: ProxyConfig

  // Expose functions
  SaveState: () => void

  UpdateProxyConfig: (profile: Profile) => void
}

const AppStateContext = createContext<TAppStateContext | undefined>(undefined)

export const AppStateProvider = ({ children }: { children: ReactNode }) => {
  // CACHE
  const [mods, SetMods] = useState<Shard.Extra[]>([])
  const [runtimes, SetRuntimes] = useState<Shard.Extra[]>([])
  const [shards, SetShards] = useState<Shard.Extra[]>(GetExtraShards)
  const [versions, SetVersions] = useState<Version.Cached[]>(GetCachedVersions)
  const [profiles, SetProfiles] = useState<Profile[]>(GetProfiles)

  const [invalid_shards, SetInvalidShards] = useState<Shard.Invalid[]>(GetInvalidShards)

  // PROFILE EDITOR
  const [index$profile_editor, SetIndex$ProfileEditor] = useState<number | undefined>(undefined)

  // CONFIG
  const [theme, SetTheme] = useState<'Light' | 'Dark' | 'System'>('System')
  const [developer_mode, SetDeveloperMode] = useState<boolean>(false)
  const [selected_profile, SetSelectedProfile] = useState<number | undefined>(undefined)
  const [registered_profile, SetRegisteredProfile] = useState<number | undefined>(undefined)

  // STATUS
  const [loading_percent, SetLoadingPercent] = useState<number>(0)
  const [is_loading, SetIsLoading] = useState<boolean>(false)
  const [status, SetStatus] = useState<string>('')
  const [error, SetError] = useState<string>('')

  const [config, SetConfig] = useState<Config>(Config.Get)
  const [proxy_config, SetProxyConfig] = useState<ProxyConfig>(ProxyConfig.Get)

  // Initialize Data like all mods and existing profiles
  useEffect(() => {
    SetRuntimes(shards.filter(s => s.manifest.meta.format === Shard.Format.Runtime))
    SetMods(shards.filter(s => s.manifest.meta.format === Shard.Format.Mod || s.manifest.meta.format === undefined))

    SetDeveloperMode(config.developer_mode)
    SetSelectedProfile(config.selected_profile)
    SetRegisteredProfile(config.registered_profile)
    SetTheme(config.theme)
  }, [config.selected_profile, config.developer_mode, config.theme, shards, config.registered_profile])

  useEffect(() => {
    FetchAvailableVersions().then(() => {
      SetVersions(GetCachedVersions)
    })
  }, [])

  const [initialized, SetInitialized] = useState(false)

  const SaveState = useCallback(() => {
    SetProfilesFile(profiles)

    const config: Config = {
      theme: theme,
      selected_profile: selected_profile,
      registered_profile: registered_profile,
      developer_mode: developer_mode
    }

    Config.Set(config)
    SetConfig(config)
  }, [profiles, theme, selected_profile, registered_profile, developer_mode])

  const UpdateProxyConfig = useCallback(
    (profile: Profile) => {
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

      ProxyConfig.Set(runtime_config)
      SetProxyConfig(ProxyConfig.Get)
    },
    [developer_mode]
  )

  useEffect(() => {
    proxy_config.developer_mode = developer_mode

    ProxyConfig.Set(proxy_config)
  }, [developer_mode, proxy_config])

  useEffect(() => {
    if (!initialized) {
      SetInitialized(true)
      return
    }

    SaveState()
  }, [profiles, selected_profile, registered_profile, developer_mode, initialized, SaveState])

  useEffect(() => {
    if (selected_profile !== undefined && profiles[selected_profile] === undefined) {
      if (profiles.length > 0) {
        SetSelectedProfile(profiles.length - 1)
      } else {
        SetSelectedProfile(undefined)
      }
    }
  }, [selected_profile, profiles])

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

        invalid_shards: invalid_shards,
        SetInvalidShards: SetInvalidShards,

        index$profile_editor: index$profile_editor,
        SetIndex$ProfileEditor: SetIndex$ProfileEditor,

        theme: theme,
        SetTheme: SetTheme,
        developer_mode: developer_mode,
        SetDeveloperMode: SetDeveloperMode,
        selected_profile: selected_profile,
        SetSelectedProfile: SetSelectedProfile,
        registered_profile: registered_profile,
        SetRegisteredProfile: SetRegisteredProfile,

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
        proxy_config: proxy_config,

        UpdateProxyConfig: UpdateProxyConfig
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
