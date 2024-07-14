import React, {createContext, ReactNode, useCallback, useContext, useEffect, useState} from "react";

import {FetchMinecraftVersions, MinecraftVersion} from "../scripts/Versions"
import {LauncherConfig, GetLauncherConfig, SetLauncherConfig} from "../scripts/Launcher";
import {GetProfiles, Profile, SetProfiles} from "../scripts/Profiles";

import { ipcRenderer } from "electron";
import {GetMods} from "../scripts/Mods";

interface TAppStateContext {
    allMods: string[];
    setAllMods: React.Dispatch<React.SetStateAction<string[]>>;

    allRuntimes: string[];
    setAllRuntimes: React.Dispatch<React.SetStateAction<string[]>>;

    allMinecraftVersions: MinecraftVersion[];
    setAllMinecraftVersions: React.Dispatch<React.SetStateAction<MinecraftVersion[]>>;

    allProfiles: Profile[];
    setAllProfiles: React.Dispatch<React.SetStateAction<Profile[]>>;

    selectedProfile: number;
    setSelectedProfile: React.Dispatch<React.SetStateAction<number>>;

    UITheme: string;
    setUITheme: React.Dispatch<React.SetStateAction<string>>;

    keepLauncherOpen: boolean;
    setKeepLauncherOpen: React.Dispatch<React.SetStateAction<boolean>>;

    developerMode: boolean;
    setDeveloperMode: React.Dispatch<React.SetStateAction<boolean>>;

    loadingPercent: number;
    setLoadingPercent: React.Dispatch<React.SetStateAction<number>>;

    isLoading: boolean;
    setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;

    status: string;
    setStatus: React.Dispatch<React.SetStateAction<string>>;

    error: string;
    setError: React.Dispatch<React.SetStateAction<string>>;

    // Expose functions
    saveData: () => void
}

const AppStateContext = createContext<TAppStateContext | undefined>(undefined);

export const AppStateProvider = ({children}: { children: ReactNode }) => {
    const [allMods, setAllMods] = useState<string[]>([]);
    const [allRuntimes, setAllRuntimes] = useState<string[]>([]);
    const [allMinecraftVersions, setAllMinecraftVersions] = useState<MinecraftVersion[]>([]);
    const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
    const [selectedProfile, setSelectedProfile] = useState(0);
    const [UITheme, setUITheme] = useState("System");
    const [keepLauncherOpen, setKeepLauncherOpen] = useState(true);
    const [developerMode, setDeveloperMode] = useState(false);
    const [loadingPercent, setLoadingPercent] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");

    // Initialize Data like all mods and existing profiles..
    useEffect(() => {
        setAllProfiles(GetProfiles());

        const modList = GetMods();
        setAllRuntimes(["Vanilla", ...modList.runtimeMods]);
        setAllMods(modList.mods);

        const readConfig = GetLauncherConfig();
        setKeepLauncherOpen(readConfig.keep_open ?? true);
        setDeveloperMode(readConfig.developer_mode ?? false);
        setSelectedProfile(readConfig.selected_profile ?? 0);
        setUITheme(readConfig.ui_theme ?? "Light");

        const fetchMinecraftVersions = async () => {
            const versions = await FetchMinecraftVersions();
            setAllMinecraftVersions(versions);
        }

        fetchMinecraftVersions();
    }, [])

    const [hasInitialized, setHasInitialized] = useState(false);

    const saveData = useCallback(() => {
        SetProfiles(allProfiles);

        const launcherConfig: LauncherConfig = {
            developer_mode: developerMode,
            keep_open: keepLauncherOpen,
            mods: allProfiles[selectedProfile]?.mods ?? [],
            runtime: allProfiles[selectedProfile]?.runtime ?? "",
            selected_profile: selectedProfile,
            ui_theme: UITheme
        };

        SetLauncherConfig(launcherConfig);
    }, [allProfiles, developerMode, keepLauncherOpen, selectedProfile, UITheme])

    useEffect(() => {
        if (!hasInitialized) {
            setHasInitialized(true);
            return;
        }

        saveData();
    }, [allProfiles, selectedProfile, keepLauncherOpen, developerMode, hasInitialized, saveData])

    useEffect(() => {
        ipcRenderer.send('WINDOW_UI_THEME', UITheme)
    }, [UITheme])

    return (
        <AppStateContext.Provider value={
            {
                allMods, setAllMods,
                allRuntimes, setAllRuntimes,
                allMinecraftVersions, setAllMinecraftVersions,
                allProfiles, setAllProfiles,
                selectedProfile, setSelectedProfile,
                UITheme, setUITheme,
                keepLauncherOpen, setKeepLauncherOpen,
                developerMode, setDeveloperMode,
                loadingPercent, setLoadingPercent,
                isLoading, setIsLoading,
                status, setStatus,
                saveData,
                error, setError
            }
        }>
            {children}
        </AppStateContext.Provider>
    )
}

export const useAppState = () => {
    const context = useContext(AppStateContext);
    if (!context) throw new Error('useAppState must be used within a MyProvider');
    return context;
};
