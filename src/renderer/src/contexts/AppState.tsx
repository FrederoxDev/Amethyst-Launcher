import { Analytics, getAnalytics } from "firebase/analytics";
import { create } from "zustand";

import { firebaseApp } from "@renderer/firebase/Firebase";

import { GetLauncherConfig, LauncherConfig, SetLauncherConfig } from "@renderer/scripts/Launcher";
import { GetAllMods, ValidatedMod } from "@renderer/scripts/Mods";
import { GetProfiles, Profile, SetProfiles } from "@renderer/scripts/Profiles";
import { FetchMinecraftVersions, MinecraftVersion } from "@renderer/scripts/Versions";
import { ILauncherPlatform } from "@renderer/scripts/platform/LauncherPlatform";
import { WindowsLauncherPlatform } from "@renderer/scripts/platform/WindowsLauncherPlatform";
import { LinuxLauncherPlatform } from "@renderer/scripts/platform/LinuxLauncherPlatform";

const { ipcRenderer } = window.require("electron");

type SetStateAction<T> = T | ((previous: T) => T);

type StateSetter<T> = (value: SetStateAction<T>) => void;

function resolveSetStateAction<T>(value: SetStateAction<T>, previous: T): T {
    return typeof value === "function" ? (value as (previous: T) => T)(previous) : value;
}

export enum AnalyticsConsent {
    Unknown = "Unknown",
    Accepted = "Accepted",
    Declined = "Declined",
}

interface TAppStateContext {
    allMods: ValidatedMod[];

    allValidMods: string[];
    setAllValidMods: StateSetter<string[]>;

    allInvalidMods: string[];

    allRuntimes: string[];
    setAllRuntimes: StateSetter<string[]>;

    allMinecraftVersions: MinecraftVersion[];
    setAllMinecraftVersions: StateSetter<MinecraftVersion[]>;

    allProfiles: Profile[];
    setAllProfiles: StateSetter<Profile[]>;

    selectedProfile: number;
    setSelectedProfile: StateSetter<number>;

    UITheme: string;
    setUITheme: StateSetter<string>;

    keepLauncherOpen: boolean;
    setKeepLauncherOpen: StateSetter<boolean>;

    developerMode: boolean;
    setDeveloperMode: StateSetter<boolean>;

    loadingPercent: number;
    setLoadingPercent: StateSetter<number>;

    isLoading: boolean;
    setIsLoading: StateSetter<boolean>;

    status: string;
    setStatus: StateSetter<string>;

    error: string;
    setError: StateSetter<string>;

    analyticsConsent: AnalyticsConsent;
    setAnalyticsConsent: StateSetter<AnalyticsConsent>;

    analyticsInstance: Analytics | null;

    saveData: () => void;
    refreshAllMods: () => void;

    platform: ILauncherPlatform;
}

function getInitialAnalyticsConsent(): AnalyticsConsent {
    const stored = localStorage.getItem("analyticsConsent");
    if (stored === AnalyticsConsent.Accepted) return AnalyticsConsent.Accepted;
    if (stored === AnalyticsConsent.Declined) return AnalyticsConsent.Declined;
    return AnalyticsConsent.Unknown;
}

function getAnalyticsInstanceForConsent(consent: AnalyticsConsent): Analytics | null {
    if (consent !== AnalyticsConsent.Accepted) return null;
    return getAnalytics(firebaseApp);
}

export const UseAppState = create<TAppStateContext>((set, get) => {
    const initialConsent = getInitialAnalyticsConsent();

    let platformInstance: ILauncherPlatform;
    if (process.platform === "win32") {
        platformInstance = new WindowsLauncherPlatform();
    } else if (process.platform === "linux") {
        platformInstance = new LinuxLauncherPlatform();
    } else {
        throw new Error(`Unsupported platform: ${process.platform}`);
    }

    return {
        allMods: [],
        allValidMods: [],
        allInvalidMods: [],
        allRuntimes: [],
        allMinecraftVersions: [],
        allProfiles: [],
        selectedProfile: 0,
        UITheme: "System",
        keepLauncherOpen: true,
        developerMode: false,
        loadingPercent: 0,
        isLoading: false,
        status: "",
        error: "",
        analyticsConsent: initialConsent,
        analyticsInstance: getAnalyticsInstanceForConsent(initialConsent),

        setAllValidMods: value =>
            set(state => ({ allValidMods: resolveSetStateAction(value, state.allValidMods) })),
        setAllRuntimes: value => set(state => ({ allRuntimes: resolveSetStateAction(value, state.allRuntimes) })),
        setAllMinecraftVersions: value =>
            set(state => ({ allMinecraftVersions: resolveSetStateAction(value, state.allMinecraftVersions) })),
        setAllProfiles: value => set(state => ({ allProfiles: resolveSetStateAction(value, state.allProfiles) })),
        setSelectedProfile: value =>
            set(state => ({ selectedProfile: resolveSetStateAction(value, state.selectedProfile) })),
        setUITheme: value =>
            set(state => {
                const nextTheme = resolveSetStateAction(value, state.UITheme);
                ipcRenderer.send("WINDOW_UI_THEME", nextTheme);
                return { UITheme: nextTheme };
            }),
        setKeepLauncherOpen: value =>
            set(state => ({ keepLauncherOpen: resolveSetStateAction(value, state.keepLauncherOpen) })),
        setDeveloperMode: value =>
            set(state => ({ developerMode: resolveSetStateAction(value, state.developerMode) })),
        setLoadingPercent: value =>
            set(state => ({ loadingPercent: resolveSetStateAction(value, state.loadingPercent) })),
        setIsLoading: value => set(state => ({ isLoading: resolveSetStateAction(value, state.isLoading) })),
        setStatus: value => set(state => ({ status: resolveSetStateAction(value, state.status) })),
        setError: value => set(state => ({ error: resolveSetStateAction(value, state.error) })),

        setAnalyticsConsent: value =>
            set(state => {
                const nextConsent = resolveSetStateAction(value, state.analyticsConsent);

                if (nextConsent !== AnalyticsConsent.Unknown) {
                    localStorage.setItem("analyticsConsent", nextConsent);
                }

                return {
                    analyticsConsent: nextConsent,
                    analyticsInstance: getAnalyticsInstanceForConsent(nextConsent),
                };
            }),

        refreshAllMods: () => {
            const mods = GetAllMods();
            const invalidMods = mods.filter(mod => !mod.ok).map(mod => mod.id);
            const validMods = mods.filter(mod => mod.ok);
            const runtimes = validMods.filter(mod => mod.config.meta.type === "runtime");
            const modIds = validMods.filter(mod => mod.config.meta.type !== "runtime").map(mod => mod.id);

            set({
                allMods: mods,
                allRuntimes: ["Vanilla", ...runtimes.map(runtime => runtime.id)],
                allValidMods: modIds,
                allInvalidMods: invalidMods,
            });
        },

        saveData: () => {
            const state = get();

            SetProfiles(state.allProfiles);

            const launcherConfig: LauncherConfig = {
                developer_mode: state.developerMode,
                keep_open: state.keepLauncherOpen,
                mods: state.allProfiles[state.selectedProfile]?.mods ?? [],
                runtime: state.allProfiles[state.selectedProfile]?.runtime ?? "",
                selected_profile: state.selectedProfile,
                ui_theme: state.UITheme,
            };

            SetLauncherConfig(launcherConfig);
        },

        platform: platformInstance, // This will be properly initialized in the InitializeAppState function after we determine the platform
    };
});

let hasBoundInitializationIpc = false;
let hasInitializedState = false;

function hydrateStoreOnce(): void {
    if (hasInitializedState) return;
    hasInitializedState = true;

    const profiles = GetProfiles();
    const config = GetLauncherConfig();

    UseAppState.setState({
        allProfiles: profiles,
        keepLauncherOpen: config.keep_open ?? true,
        developerMode: config.developer_mode ?? false,
        selectedProfile: config.selected_profile ?? 0,
        UITheme: config.ui_theme ?? "Light"
    });

    ipcRenderer.send("WINDOW_UI_THEME", UseAppState.getState().UITheme);
    UseAppState.getState().refreshAllMods();

    FetchMinecraftVersions().then(versions => {
        UseAppState.setState({ allMinecraftVersions: versions });
    });
}

export function InitializeAppState(): void {
    if (hasBoundInitializationIpc) return;
    hasBoundInitializationIpc = true;

    ipcRenderer.once("APP_STATE_INIT", () => {
        hydrateStoreOnce();
    });

    ipcRenderer.send("APP_STATE_INIT_REQUEST");
}

InitializeAppState();
