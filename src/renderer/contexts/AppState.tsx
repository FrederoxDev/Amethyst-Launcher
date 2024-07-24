import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'

import { FetchMinecraftVersions, MinecraftVersion } from '../scripts/Versions'
import { LauncherConfig, GetLauncherConfig, SetLauncherConfig } from '../scripts/Launcher'
import { GetProfiles, Profile } from '../scripts/Profiles'

import { VersionsFileData } from '../scripts/Versioning'

import { ipcRenderer } from 'electron'
import { GetMods } from '../scripts/Mods'
import * as Paths from '../scripts/Paths'

interface TAppStateContext {
  mods: string[]
  SetMods: React.Dispatch<React.SetStateAction<string[]>>

  runtimes: string[]
  SetRuntimes: React.Dispatch<React.SetStateAction<string[]>>

  minecraft_versions: MinecraftVersion[]
  SetMinecraftVersions: React.Dispatch<React.SetStateAction<MinecraftVersion[]>>

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

  versions_file: VersionsFileData
  SetVersionsFile: React.Dispatch<React.SetStateAction<VersionsFileData>>

  // Expose functions
  saveData: () => void
}

const AppStateContext = createContext<TAppStateContext | undefined>(undefined)

export const AppStateProvider = ({ children }: { children: ReactNode }) => {
  const [mods, SetMods] = useState<string[]>([])
  const [runtimes, SetRuntimes] = useState<string[]>([])
  const [minecraft_versions, SetMinecraftVersions] = useState<MinecraftVersion[]>([])
  const [profiles, SetProfiles] = useState<Profile[]>([])
  const [selected_profile, SetSelectedProfile] = useState(0)
  const [ui_theme, SetUITheme] = useState('System')
  const [keep_launcher_open, SetKeepLauncherOpen] = useState(true)
  const [developer_mode, SetDeveloperMode] = useState(false)
  const [loading_percent, SetLoadingPercent] = useState(0)
  const [is_loading, SetIsLoading] = useState(false)
  const [status, SetStatus] = useState('')
  const [error, SetError] = useState('')

  const [versions_file, SetVersionsFile] = useState<VersionsFileData>({ versions: [], default_path: Paths.VersionsFolder })

  // Initialize Data like all mods and existing profiles
  useEffect(() => {
    SetProfiles(GetProfiles())

    const modList = GetMods()
    SetRuntimes(['Vanilla', ...modList.runtimeMods])
    SetMods(modList.mods)

    const readConfig = GetLauncherConfig()
    SetKeepLauncherOpen(readConfig.keep_open ?? true)
    SetDeveloperMode(readConfig.developer_mode ?? false)
    SetSelectedProfile(readConfig.selected_profile ?? 0)
    SetUITheme(readConfig.ui_theme ?? 'Light')

    FetchMinecraftVersions().then(versions => {
      SetMinecraftVersions(versions)
    })
  }, [])

  const [hasInitialized, setHasInitialized] = useState(false)

  const saveData = useCallback(() => {
    SetProfiles(profiles)

    const launcherConfig: LauncherConfig = {
      developer_mode: developer_mode,
      keep_open: keep_launcher_open,
      mods: profiles[selected_profile]?.mods ?? [],
      runtime: profiles[selected_profile]?.runtime ?? '',
      selected_profile: selected_profile,
      ui_theme: ui_theme
    }

    SetLauncherConfig(launcherConfig)
  }, [profiles, developer_mode, keep_launcher_open, selected_profile, ui_theme])

  useEffect(() => {
    if (!hasInitialized) {
      setHasInitialized(true)
      return
    }

    saveData()
  }, [profiles, selected_profile, keep_launcher_open, developer_mode, hasInitialized, saveData])

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
        minecraft_versions: minecraft_versions,
        SetMinecraftVersions: SetMinecraftVersions,
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
        saveData,
        error: error,
        SetError: SetError,
        versions_file: versions_file,
        SetVersionsFile: SetVersionsFile
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
