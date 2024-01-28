import { ReactNode, createContext, useContext, useEffect, useState } from "react";
import { Profile } from "../types/Profile";
import { getAmethystFolder } from "../versionSwitcher/VersionManager";
import { findAllProfiles, saveAllProfiles } from "../launcher/Modlist";

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
}

const AppStateContext = createContext<TAppStateContext | undefined>(undefined);

export const AppStateProvider = ({ children }: { children: ReactNode }) => {
    const [ allMods, setAllMods ] = useState<string[]>(["Mod 1", "Mod 2"]);
    const [ allRuntimes, setAllRuntimes ] = useState<string[]>(["Vanilla", "AmethystRuntime@1.2.0"]);
    const [ allMinecraftVersions, setAllMinecraftVersions ] = useState(["1.20.51.1", "1.20.30.02"]);
    const [ allProfiles, setAllProfiles ] = useState<Profile[]>([]);
    const [ selectedProfile, setSelectedProfile ] = useState(0);

    useEffect(() => {
        setAllProfiles(findAllProfiles());
    }, [])

    const [ hasInitialized, setHasInitialized ] = useState(false);

    useEffect(() => {
        if (!hasInitialized) {
            setHasInitialized(true);
            return;
        }

        saveAllProfiles(allProfiles);
    }, [ allProfiles ])

    return (
        <AppStateContext.Provider value={
            { 
                allMods, setAllMods, allRuntimes, setAllRuntimes, allMinecraftVersions, 
                setAllMinecraftVersions, allProfiles, setAllProfiles, selectedProfile, setSelectedProfile
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