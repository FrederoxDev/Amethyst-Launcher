import { Analytics, getAnalytics } from "firebase/analytics";
import { create } from "zustand";

import { firebaseApp } from "@renderer/firebase/Firebase";

import { GetLauncherConfig, LauncherConfig, SetLauncherConfig } from "@renderer/scripts/Launcher";
import { GetAllMods, ValidatedMod } from "@renderer/scripts/Mods";
import { GetProfiles, Profile, SetProfiles } from "@renderer/scripts/Profiles";
import { FetchMinecraftVersions, MinecraftVersion, VersionDatabase } from "@renderer/scripts/VersionDatabase";
import { ILauncherPlatform } from "@renderer/scripts/platform/LauncherPlatform";
import { WindowsLauncherPlatform } from "@renderer/scripts/platform/WindowsLauncherPlatform";
import { LinuxLauncherPlatform } from "@renderer/scripts/platform/LinuxLauncherPlatform";
import { BLOCKED_ACTIONS, DEFAULT_STATUS } from "@renderer/scripts/LauncherStatus";
import { VersionManager } from "@renderer/scripts/VersionManager";

const { ipcRenderer } = window.require("electron");

type SetStateAction<T> = T | ((previous: T) => T);
type StateSetter<T> = (value: SetStateAction<T>) => void;

function resolveSetStateAction<T>(value: SetStateAction<T>, previous: T): T {
    return typeof value === "function" ? (value as (previous: T) => T)(previous) : value;
}

export type AppStatusType = 
    | "idle"
    | "downloading"
    | "extracting"
    | "decrypting"
    | "launching";

export type ActionType = "launch" | "download" | "extract" | "decrypt";

export interface LauncherStatus {
    type: AppStatusType;
    taskName: string | null;
    progress: number | null;
    errorMsg: string | null;
    showLoading: boolean;
    canCancel: boolean;
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

    allProfiles: Profile[];
    setAllProfiles: StateSetter<Profile[]>;

    selectedProfile: number;
    setSelectedProfile: StateSetter<number>;

    UITheme: string;
    setUITheme: StateSetter<string>;

    keepLauncherOpen: boolean;
    setKeepLauncherOpen: StateSetter<boolean>;

    status: LauncherStatus;
    setStatus: StateSetter<LauncherStatus>;

    error: string;
    setError: StateSetter<string>;

    analyticsConsent: AnalyticsConsent;
    setAnalyticsConsent: StateSetter<AnalyticsConsent>;

    analyticsInstance: Analytics | null;

    saveData: () => void;
    refreshAllMods: () => void;

    platform: ILauncherPlatform;

    isBusy: () => boolean;
    canDoAction: (action: ActionType) => boolean;

    versionManager: VersionManager;
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
        status: DEFAULT_STATUS,
        error: "",
        analyticsConsent: initialConsent,
        analyticsInstance: getAnalyticsInstanceForConsent(initialConsent),

        setAllValidMods: value =>
            set(state => ({ allValidMods: resolveSetStateAction(value, state.allValidMods) })),
        setAllRuntimes: value => set(state => ({ allRuntimes: resolveSetStateAction(value, state.allRuntimes) })),
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
                keep_open: state.keepLauncherOpen,
                mods: state.allProfiles[state.selectedProfile]?.mods ?? [],
                runtime: state.allProfiles[state.selectedProfile]?.runtime ?? "",
                selected_profile: state.selectedProfile,
                ui_theme: state.UITheme,
            };

            SetLauncherConfig(launcherConfig);
        },

        platform: platformInstance,

        isBusy: () => {
            const status = get().status.type;
            return status !== "idle";
        },

        canDoAction: (action: ActionType) => {
            const status = get().status.type;
            const blockedActions = BLOCKED_ACTIONS[status];
            return !blockedActions.includes(action);
        },

        versionManager: new VersionManager()
    };
});

let hasBoundInitializationIpc = false;
let hasInitializedState = false;

async function hydrateStoreOnce(): Promise<void> {
    if (hasInitializedState) return;
    hasInitializedState = true;

    const profiles = GetProfiles();
    const config = GetLauncherConfig();

    UseAppState.setState({
        allProfiles: profiles,
        keepLauncherOpen: config.keep_open ?? true,
        selectedProfile: config.selected_profile ?? 0,
        UITheme: config.ui_theme ?? "Light"
    });

    ipcRenderer.send("WINDOW_UI_THEME", UseAppState.getState().UITheme);
    UseAppState.getState().refreshAllMods();
}

export function InitializeAppState(): void {
    if (hasBoundInitializationIpc) return;
    hasBoundInitializationIpc = true;

    ipcRenderer.once("APP_STATE_INIT", async () => {
        await hydrateStoreOnce();
    });

    ipcRenderer.send("APP_STATE_INIT_REQUEST");
}

InitializeAppState();
