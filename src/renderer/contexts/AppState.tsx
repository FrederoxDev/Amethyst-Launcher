import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'

import { FetchMinecraftVersions, MinecraftVersion } from '../scripts/Versions'
import { LauncherConfig, GetLauncherConfig, SetLauncherConfig } from '../scripts/Launcher'
import { GetProfiles, Profile, SetProfiles } from '../scripts/Profiles'

import { ipcRenderer } from 'electron'
import { GetAllMods, ValidatedMod } from '../scripts/Mods'
import { Analytics, getAnalytics, logEvent, setAnalyticsCollectionEnabled } from 'firebase/analytics'
import { firebaseApp } from '../firebase/Firebase'

interface TAppStateContext {
  allMods: ValidatedMod[];

  allValidMods: string[]
  setAllValidMods: React.Dispatch<React.SetStateAction<string[]>>

  allInvalidMods: string[]

  allRuntimes: string[]
  setAllRuntimes: React.Dispatch<React.SetStateAction<string[]>>

  allMinecraftVersions: MinecraftVersion[]
  setAllMinecraftVersions: React.Dispatch<React.SetStateAction<MinecraftVersion[]>>

  allProfiles: Profile[]
  setAllProfiles: React.Dispatch<React.SetStateAction<Profile[]>>

  selectedProfile: number
  setSelectedProfile: React.Dispatch<React.SetStateAction<number>>

  UITheme: string
  setUITheme: React.Dispatch<React.SetStateAction<string>>

  keepLauncherOpen: boolean
  setKeepLauncherOpen: React.Dispatch<React.SetStateAction<boolean>>

  developerMode: boolean
  setDeveloperMode: React.Dispatch<React.SetStateAction<boolean>>

  loadingPercent: number
  setLoadingPercent: React.Dispatch<React.SetStateAction<number>>

  isLoading: boolean
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>

  status: string
  setStatus: React.Dispatch<React.SetStateAction<string>>

  error: string
  setError: React.Dispatch<React.SetStateAction<string>>

  analyticsConsent: AnalyticsConsent;
  setAnalyticsConsent: React.Dispatch<React.SetStateAction<AnalyticsConsent>>;

  analyticsInstance: Analytics | null;

  // Expose functions
  saveData: () => void
  refreshAllMods: () => void
}

const AppStateContext = createContext<TAppStateContext | undefined>(undefined)

export enum AnalyticsConsent {
  Unknown = "Unknown",
  Accepted = "Accepted",
  Declined = "Declined"
}

export const AppStateProvider = ({ children }: { children: ReactNode }) => {
  const [allMods, setAllMods] = useState<ValidatedMod[]>([]);
  const [allValidMods, setAllValidMods] = useState<string[]>([]); 
  const [allInvalidMods, setAllInvalidMods] = useState<string[]>([]);

  const [allRuntimes, setAllRuntimes] = useState<string[]>([])
  const [allMinecraftVersions, setAllMinecraftVersions] = useState<MinecraftVersion[]>([])
  const [allProfiles, setAllProfiles] = useState<Profile[]>([])
  const [selectedProfile, setSelectedProfile] = useState(0)
  const [UITheme, setUITheme] = useState('System')
  const [keepLauncherOpen, setKeepLauncherOpen] = useState(true)
  const [developerMode, setDeveloperMode] = useState(false)
  const [loadingPercent, setLoadingPercent] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const [analyticsConsent, setAnalyticsConsent] = useState<AnalyticsConsent>(() => {
    const stored = localStorage.getItem("analyticsConsent");
    if (stored === AnalyticsConsent.Accepted) return AnalyticsConsent.Accepted;
    if (stored === AnalyticsConsent.Declined) return AnalyticsConsent.Declined;
    return AnalyticsConsent.Unknown;
  });

  const [analyticsInstance, setAnalyticsInstance] = useState<Analytics | null>(null);

  useEffect(() => {
    if (analyticsConsent === AnalyticsConsent.Accepted && !analyticsInstance) {
      const instance = getAnalytics(firebaseApp);
      setAnalyticsInstance(instance);
    }
    else if ((analyticsConsent === AnalyticsConsent.Declined || analyticsConsent === AnalyticsConsent.Unknown) && analyticsInstance) {
      setAnalyticsInstance(null);
    }

    if (analyticsConsent === AnalyticsConsent.Unknown) return; // don't save unknown
    localStorage.setItem("analyticsConsent", analyticsConsent);
  }, [analyticsConsent, analyticsInstance]);

  const refreshAllMods = useCallback(() => {
    const mods = GetAllMods(); // fetch or recalc all mods
    setAllMods(mods);

    const _invalidMods = mods.filter(mod => !mod.ok).map(mod => mod.id);
    const validMods = mods.filter(mod => mod.ok);
    const runtimes = validMods.filter(mod => mod.config.meta.type === 'runtime');
    const modIds = validMods.filter(mod => mod.config.meta.type !== 'runtime').map(m => m.id);

    setAllRuntimes(['Vanilla', ...runtimes.map(r => r.id)]);
    setAllValidMods(modIds);
    setAllInvalidMods(_invalidMods);
  }, []);

  // Initialize Data like all mods and existing profiles..
  useEffect(() => {
    setAllProfiles(GetProfiles())

    const readConfig = GetLauncherConfig()
    setKeepLauncherOpen(readConfig.keep_open ?? true)
    setDeveloperMode(readConfig.developer_mode ?? false)
    setSelectedProfile(readConfig.selected_profile ?? 0)
    setUITheme(readConfig.ui_theme ?? 'Light')

    FetchMinecraftVersions().then(versions => {
      setAllMinecraftVersions(versions)
    })
  }, [allMods])

  useEffect(() => {
    setAllMods(GetAllMods());
  }, [])

  const [hasInitialized, setHasInitialized] = useState(false)

  const saveData = useCallback(() => {
    SetProfiles(allProfiles)

    const launcherConfig: LauncherConfig = {
      developer_mode: developerMode,
      keep_open: keepLauncherOpen,
      mods: allProfiles[selectedProfile]?.mods ?? [],
      runtime: allProfiles[selectedProfile]?.runtime ?? '',
      selected_profile: selectedProfile,
      ui_theme: UITheme
    }

    SetLauncherConfig(launcherConfig)
  }, [allProfiles, developerMode, keepLauncherOpen, selectedProfile, UITheme])

  useEffect(() => {
    if (!hasInitialized) {
      setHasInitialized(true)
      return
    }

    saveData()
  }, [allProfiles, selectedProfile, keepLauncherOpen, developerMode, hasInitialized, saveData])

  useEffect(() => {
    ipcRenderer.send('WINDOW_UI_THEME', UITheme)
  }, [UITheme])

  return (
    <AppStateContext.Provider
      value={{
        allMods,
        allValidMods,
        setAllValidMods,
        allInvalidMods,
        allRuntimes,
        setAllRuntimes,
        allMinecraftVersions,
        setAllMinecraftVersions,
        allProfiles,
        setAllProfiles,
        selectedProfile,
        setSelectedProfile,
        UITheme,
        setUITheme,
        keepLauncherOpen,
        setKeepLauncherOpen,
        developerMode,
        setDeveloperMode,
        loadingPercent,
        setLoadingPercent,
        isLoading,
        setIsLoading,
        status,
        setStatus,
        saveData,
        error,
        setError,
        analyticsConsent,
        setAnalyticsConsent,
        analyticsInstance,
        refreshAllMods
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

// export function trySendAnalyticsEvent(analyticsInstance: Analytics, eventName: string, eventParams?: { [key: string]: any }) {
//   const { analyticsConsent, analyticsInstance } = UseAppState();
//   if (analyticsConsent !== AnalyticsConsent.Accepted || !analyticsInstance) return;
//   logEvent(analyticsInstance, eventName, eventParams);
// }