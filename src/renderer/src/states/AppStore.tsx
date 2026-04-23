import { create } from "zustand";

import { GetLauncherConfig, LauncherConfig, SetLauncherConfig } from "@renderer/scripts/Launcher";
import { GetAllMods, ValidatedMod } from "@renderer/scripts/Mods";
import { GetProfiles, Profile, SetProfiles } from "@renderer/scripts/Profiles";
import { ILauncherPlatform } from "@renderer/scripts/platform/LauncherPlatform";
import { WindowsLauncherPlatform } from "@renderer/scripts/platform/WindowsLauncherPlatform";
import { LinuxLauncherPlatform } from "@renderer/scripts/platform/LinuxLauncherPlatform";
import { VersionManager } from "@renderer/scripts/VersionManager";
import { FileLocker } from "@renderer/scripts/FileLocker";
import { StateSetter, StateUtils } from "./StateUtils";
import { resumePendingDownloads } from "@renderer/scripts/DownloadRecovery";

const { ipcRenderer } = window.require("electron");

interface AppStore {
    allMods: ValidatedMod[];

    allValidMods: string[];
    setAllValidMods: StateSetter<string[]>;

    allInvalidMods: string[];

    allRuntimes: string[];
    setAllRuntimes: StateSetter<string[]>;

    allProfiles: Profile[];
    setAllProfiles: StateSetter<Profile[]>;

    selectedProfileUuid: string | null;
    setSelectedProfileUuid: StateSetter<string | null>;

    editingProfile: number;
    setEditingProfile: StateSetter<number>;

    UITheme: string;
    setUITheme: StateSetter<string>;

    keepLauncherOpen: boolean;
    setKeepLauncherOpen: StateSetter<boolean>;

    developerMode: boolean;
    setDeveloperMode: StateSetter<boolean>;

    error: string;
    setError: StateSetter<string>;

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

export const useAppStore = create<AppStore>((set, get) => {
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
        selectedProfileUuid: null,
        editingProfile: 0,
        UITheme: "System",
        keepLauncherOpen: true,
        developerMode: false,
        error: "",
        downloadingMods: [],
        installingForProfile: null,

        setAllValidMods: value =>
            set(state => ({ allValidMods: StateUtils.resolveSetStateAction(value, state.allValidMods) })),
        setAllRuntimes: value => set(state => ({ allRuntimes: StateUtils.resolveSetStateAction(value, state.allRuntimes) })),
        setAllProfiles: value => set(state => ({ allProfiles: StateUtils.resolveSetStateAction(value, state.allProfiles) })),
        setSelectedProfileUuid: value =>
            set(state => ({ selectedProfileUuid: StateUtils.resolveSetStateAction(value, state.selectedProfileUuid) })),
        setEditingProfile: value =>
            set(state => ({ editingProfile: StateUtils.resolveSetStateAction(value, state.editingProfile) })),
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
        setError: value => set(state => ({ error: StateUtils.resolveSetStateAction(value, state.error) })),

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

            const runtimeIds = new Set(
                state.allMods
                    .filter(mod => mod.ok && mod.config.meta.type === "runtime")
                    .map(mod => mod.id)
            );

            const normalizedProfiles = state.allProfiles.map(profile => {
                const runtimeMods = profile.mods.filter(modId => runtimeIds.has(modId));
                const normalizedRuntime = runtimeMods.length > 0 ? runtimeMods[0] : "Vanilla";
                const normalizedIsModded = profile.is_modded || profile.mods.length > 0 || normalizedRuntime !== "Vanilla";

                return {
                    ...profile,
                    runtime: normalizedRuntime,
                    is_modded: normalizedIsModded,
                };
            });

            const changed = normalizedProfiles.some((profile, index) => {
                const original = state.allProfiles[index];
                return profile.runtime !== original.runtime || profile.is_modded !== original.is_modded;
            });

            if (changed) {
                set({ allProfiles: normalizedProfiles });
            }

            SetProfiles(normalizedProfiles);

            const launcherConfig: LauncherConfig = {
                keep_open: state.keepLauncherOpen,
                selected_profile_uuid: state.selectedProfileUuid,
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

    let selectedProfileUuid: string | null = null;
    if (config.selected_profile_uuid && profiles.some(p => p.uuid === config.selected_profile_uuid)) {
        selectedProfileUuid = config.selected_profile_uuid;
    } else if (profiles.length > 0) {
        selectedProfileUuid = profiles[0].uuid;
    }

    useAppStore.setState({
        allProfiles: profiles,
        keepLauncherOpen: config.keep_open ?? true,
        developerMode: config.developer_mode ?? false,
        selectedProfileUuid,
        UITheme: config.ui_theme ?? "Light"
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

        // Defer non-critical work until after the UI is interactive
    });

    ipcRenderer.send("APP_STATE_INIT_REQUEST");
}

InitializeAppState();
