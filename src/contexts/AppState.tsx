import { ReactNode, createContext, useContext, useEffect, useState } from "react";
import { Profile } from "../types/Profile";
import { getAmethystFolder } from "../versionSwitcher/VersionManager";
import { findAllMods, findAllProfiles, readLauncherConfig, saveAllProfiles, saveLauncherConfig } from "../launcher/Modlist";
import { LauncherConfig } from "../types/LauncherConfig";

interface TAppStateContext {
    allMods: string[];
    setAllMods: React.Dispatch<React.SetStateAction<string[]>>;

    allRuntimes: string[];
    setAllRuntimes: React.Dispatch<React.SetStateAction<string[]>>;

    allMinecraftVersions: string[];
    setAllMinecraftVersions: React.Dispatch<React.SetStateAction<string[]>>;

    allProfiles: Profile[];
    setAllProfiles: React.Dispatch<React.SetStateAction<Profile[]>>;

    selectedProfile: number;
    setSelectedProfile: React.Dispatch<React.SetStateAction<number>>;

    keepLauncherOpen: boolean;
    setKeepLauncherOpen: React.Dispatch<React.SetStateAction<boolean>>;

    developerMode: boolean;
    setDeveloperMode: React.Dispatch<React.SetStateAction<boolean>>;

    // Expose functions
    saveData: () => void
}

const AppStateContext = createContext<TAppStateContext | undefined>(undefined);

export const AppStateProvider = ({ children }: { children: ReactNode }) => {
    const [ allMods, setAllMods ] = useState<string[]>([]);
    const [ allRuntimes, setAllRuntimes ] = useState<string[]>([]);
    const [ allMinecraftVersions, setAllMinecraftVersions ] = useState(["1.20.51.1", "1.20.30.02"]);
    const [ allProfiles, setAllProfiles ] = useState<Profile[]>([]);
    const [ selectedProfile, setSelectedProfile ] = useState(0);
    const [ keepLauncherOpen, setKeepLauncherOpen ] = useState(true);
    const [ developerMode, setDeveloperMode ] = useState(false);
 
    // Initialize Data like all mods and existing profiles..
    useEffect(() => {
        setAllProfiles(findAllProfiles());

        const modList = findAllMods();
        setAllRuntimes(["Vanilla", ...modList.runtimeMods]);
        setAllMods(modList.mods);

        const readConfig = readLauncherConfig();
        setKeepLauncherOpen(readConfig.keep_open ?? true);
        setDeveloperMode(readConfig.developer_mode ?? false);
    }, [])

    const [ hasInitialized, setHasInitialized ] = useState(false);

    const saveData = () => {
        saveAllProfiles(allProfiles);

        const launcherConfig: LauncherConfig = {
            developer_mode: developerMode,
            keep_open: keepLauncherOpen,
            mods: allProfiles[selectedProfile]?.mods ?? [],
            runtime: allProfiles[selectedProfile]?.runtime ?? ""
        };

        saveLauncherConfig(launcherConfig);
    }

    useEffect(() => {
        if (!hasInitialized) {
            setHasInitialized(true);
            return;
        }

        saveData();
    }, [ allProfiles, selectedProfile, keepLauncherOpen, developerMode ])

    return (
        <AppStateContext.Provider value={
            { 
                allMods, setAllMods, allRuntimes, setAllRuntimes, allMinecraftVersions, 
                setAllMinecraftVersions, allProfiles, setAllProfiles, selectedProfile, setSelectedProfile,
                keepLauncherOpen, setKeepLauncherOpen, developerMode, setDeveloperMode, saveData
            }
        }>
            { children }
        </AppStateContext.Provider>
    )
}

export const useAppState = () => {
    const context = useContext(AppStateContext);
    if (!context) throw new Error('useAppState must be used within a MyProvider');
    return context;
};