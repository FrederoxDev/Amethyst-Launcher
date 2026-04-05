import { Analytics, getAnalytics } from "firebase/analytics";
import { create } from "zustand";

import { firebaseApp } from "@renderer/firebase/Firebase";

import { GetLauncherConfig, LauncherConfig, SetLauncherConfig } from "@renderer/scripts/Launcher";
import { GetAllMods, ValidatedMod } from "@renderer/scripts/Mods";
import { GetProfiles, Profile, SetProfiles } from "@renderer/scripts/Profiles";
import { ILauncherPlatform } from "@renderer/scripts/platform/LauncherPlatform";
import { WindowsLauncherPlatform } from "@renderer/scripts/platform/WindowsLauncherPlatform";
import { LinuxLauncherPlatform } from "@renderer/scripts/platform/LinuxLauncherPlatform";
import { VersionManager } from "@renderer/scripts/VersionManager";
import { FileLocker } from "@renderer/scripts/FileLocker";
import { StateSetter, StateUtils } from "./StateUtils";
import { checkIfMinecraftIsRunning, startMinecraftWatcher } from "@renderer/scripts/MinecraftWatcher";
import { resumePendingDownloads } from "@renderer/scripts/DownloadRecovery";

const { ipcRenderer } = window.require("electron");

export enum AnalyticsConsent {
    Unknown = "Unknown",
    Accepted = "Accepted",
    Declined = "Declined",
}

interface AppStore {
    allMods: ValidatedMod[];

    allValidMods: string[];
    setAllValidMods: StateSetter<string[]>;

    allInvalidMods: string[];

    allRuntimes: string[];
    setAllRuntimes: StateSetter<string[]>;

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

    trustAllMods: boolean;
    setTrustAllMods: StateSetter<boolean>;

    error: string;
    setError: StateSetter<string>;

    analyticsConsent: AnalyticsConsent;
    setAnalyticsConsent: StateSetter<AnalyticsConsent>;

    analyticsInstance: Analytics | null;

    minecraftIsRunning: boolean;
    setMinecraftIsRunning: StateSetter<boolean>;

    downloadingMods: string[];
    setDownloadingMods: StateSetter<string[]>;

    installingForProfile: number | null;
    setInstallingForProfile: StateSetter<number | null>;

    saveData: () => void;
    refreshAllMods: () => void;

    platform: ILauncherPlatform;
    versionManager: VersionManager;
    fileLocker: FileLocker;
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

export const useAppStore = create<AppStore>((set, get) => {
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
        trustAllMods: false,
        error: "",
        analyticsConsent: initialConsent,
        analyticsInstance: getAnalyticsInstanceForConsent(initialConsent),
        minecraftIsRunning: false,
        downloadingMods: [],
        installingForProfile: null,

        setAllValidMods: value =>
            set(state => ({ allValidMods: StateUtils.resolveSetStateAction(value, state.allValidMods) })),
        setAllRuntimes: value => set(state => ({ allRuntimes: StateUtils.resolveSetStateAction(value, state.allRuntimes) })),
        setAllProfiles: value => set(state => ({ allProfiles: StateUtils.resolveSetStateAction(value, state.allProfiles) })),
        setSelectedProfile: value =>
            set(state => ({ selectedProfile: StateUtils.resolveSetStateAction(value, state.selectedProfile) })),
        setUITheme: value => {
            set(state => {
                const nextTheme = StateUtils.resolveSetStateAction(value, state.UITheme);
                ipcRenderer.send("WINDOW_UI_THEME", nextTheme);
                return { UITheme: nextTheme };
            });
            get().saveData();
        },
        setKeepLauncherOpen: value => {
            set(state => ({ keepLauncherOpen: StateUtils.resolveSetStateAction(value, state.keepLauncherOpen) }));
            get().saveData();
        },
        setDeveloperMode: value => {
            set(state => ({ developerMode: StateUtils.resolveSetStateAction(value, state.developerMode) }));
            get().saveData();
        },
        setTrustAllMods: value => {
            set(state => ({ trustAllMods: StateUtils.resolveSetStateAction(value, state.trustAllMods) }));
            get().saveData();
        },
        setError: value => set(state => ({ error: StateUtils.resolveSetStateAction(value, state.error) })),

        setAnalyticsConsent: value =>
            set(state => {
                const nextConsent = StateUtils.resolveSetStateAction(value, state.analyticsConsent);

                if (nextConsent !== AnalyticsConsent.Unknown) {
                    localStorage.setItem("analyticsConsent", nextConsent);
                }

                return {
                    analyticsConsent: nextConsent,
                    analyticsInstance: getAnalyticsInstanceForConsent(nextConsent),
                };
            }),

        setMinecraftIsRunning: value =>
            set(state => ({ minecraftIsRunning: StateUtils.resolveSetStateAction(value, state.minecraftIsRunning) })),
        setDownloadingMods: value =>
            set(state => ({ downloadingMods: StateUtils.resolveSetStateAction(value, state.downloadingMods) })),
        setInstallingForProfile: value =>
            set(state => ({ installingForProfile: StateUtils.resolveSetStateAction(value, state.installingForProfile) })),

        refreshAllMods: () => {
            const mods = GetAllMods();
            const invalidMods = mods.filter(mod => !mod.ok).map(mod => mod.id);
            const validMods = mods.filter(mod => mod.ok);
            const runtimes = validMods.filter(mod => mod.config.meta.type === "runtime");
            const modIds = validMods.map(mod => mod.id);

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
                keep_open: state.keepLauncherOpen,
                mods: state.allProfiles[state.selectedProfile]?.mods ?? [],
                runtime: state.allProfiles[state.selectedProfile]?.runtime ?? "",
                selected_profile: state.selectedProfile,
                ui_theme: state.UITheme,
                developer_mode: state.developerMode,
            };

            SetLauncherConfig(launcherConfig);
        },

        platform: platformInstance,
        versionManager: new VersionManager(),
        fileLocker: FileLocker.create(),
    };
});

async function hydrateStore(): Promise<void> {
    const profiles = GetProfiles();
    const config = GetLauncherConfig();

    useAppStore.setState({
        allProfiles: profiles,
        keepLauncherOpen: config.keep_open ?? true,
        selectedProfile: config.selected_profile ?? 0,
        UITheme: config.ui_theme ?? "Light",
        developerMode: config.developer_mode ?? false,
    });

    ipcRenderer.send("WINDOW_UI_THEME", useAppStore.getState().UITheme);
    useAppStore.getState().refreshAllMods();
}

export function InitializeAppState(): void {
    // Remove any previous listener so reloads don't stack handlers
    ipcRenderer.removeAllListeners("APP_STATE_INIT");

    ipcRenderer.on("APP_STATE_INIT", async () => {
        await hydrateStore();
        resumePendingDownloads();
    });

    ipcRenderer.send("APP_STATE_INIT_REQUEST");
    checkIfMinecraftIsRunning();
    startMinecraftWatcher();
}

InitializeAppState();
