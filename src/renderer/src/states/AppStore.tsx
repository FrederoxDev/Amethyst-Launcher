import { create } from "zustand";

import { LauncherConfig, readLauncherConfig, writeLauncherConfig } from "@renderer/scripts/Launcher";
import { GetAllMods, ValidatedMod } from "@renderer/scripts/Mods";
import { ProfileStore } from "@renderer/scripts/ProfileStore";
import { Profile } from "@renderer/scripts/domain/Profile";
import { ILauncherPlatform } from "@renderer/scripts/platform/LauncherPlatform";
import { WindowsLauncherPlatform } from "@renderer/scripts/platform/WindowsLauncherPlatform";
import { LinuxLauncherPlatform } from "@renderer/scripts/platform/LinuxLauncherPlatform";
import { InstalledVersion } from "@renderer/scripts/versions/InstalledVersion";
import { VersionService } from "@renderer/scripts/versions/VersionService";
import { FileLocker } from "@renderer/scripts/FileLocker";
import { StateSetter, StateUtils } from "./StateUtils";
import { resumePendingDownloads } from "@renderer/scripts/DownloadRecovery";

const { ipcRenderer } = window.require("electron") as typeof import("electron");

function createPlatform(): ILauncherPlatform {
    if (process.platform === "win32") return new WindowsLauncherPlatform();
    if (process.platform === "linux") return new LinuxLauncherPlatform();
    throw new Error(`Unsupported platform: ${process.platform}`);
}

interface AppStore {
    allMods: ValidatedMod[];
    allValidMods: string[];
    allInvalidMods: string[];
    allRuntimes: string[];

    profiles: Profile[];
    setProfiles: StateSetter<Profile[]>;

    /** Snapshot of installed versions; refreshed on install/uninstall, never read from disk during render. */
    installedVersions: readonly InstalledVersion[];
    refreshInstalledVersions: () => void;

    lastLaunchedProfileUuid: string | null;
    setLastLaunchedProfileUuid: (uuid: string | null) => void;

    editingProfileIndex: number;
    setEditingProfileIndex: StateSetter<number>;

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
    versions: VersionService;
    profileStore: ProfileStore;
    fileLocker: FileLocker;
}

export const useAppStore = create<AppStore>((set, get) => {
    const platform = createPlatform();
    const paths = platform.getPaths();
    const versions = new VersionService(paths);

    return {
        allMods: [],
        allValidMods: [],
        allInvalidMods: [],
        allRuntimes: [],
        profiles: [],
        installedVersions: [],
        lastLaunchedProfileUuid: null,
        editingProfileIndex: 0,
        UITheme: "System",
        keepLauncherOpen: true,
        developerMode: false,
        error: "",
        downloadingMods: [],
        installingForProfile: null,

        setProfiles: value => set(state => ({ profiles: StateUtils.resolveSetStateAction(value, state.profiles) })),

        refreshInstalledVersions: () => set({ installedVersions: [...versions.library.list()] }),

        setLastLaunchedProfileUuid: uuid => {
            set({ lastLaunchedProfileUuid: uuid });
            get().saveData();
        },

        setEditingProfileIndex: value =>
            set(state => ({ editingProfileIndex: StateUtils.resolveSetStateAction(value, state.editingProfileIndex) })),

        setUITheme: value => {
            set(state => {
                const next = StateUtils.resolveSetStateAction(value, state.UITheme);
                ipcRenderer.send("WINDOW_UI_THEME", next);
                return { UITheme: next };
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
            const valid = mods.filter(mod => mod.ok);
            set({
                allMods: mods,
                allRuntimes: ["Vanilla", ...valid.filter(m => m.config.meta.type === "runtime").map(m => m.id)],
                allValidMods: valid.map(m => m.id),
                allInvalidMods: mods.filter(m => !m.ok).map(m => m.id),
            });
        },

        saveData: () => {
            const state = get();

            const runtimeIds = new Set(
                state.allMods.filter(m => m.ok && m.config.meta.type === "runtime").map(m => m.id)
            );

            const normalized = state.profiles.map(profile => {
                const runtimeMod = profile.mods.find(id => runtimeIds.has(id));
                return { ...profile, runtime: runtimeMod ?? "Vanilla" };
            });

            if (normalized.some((p, i) => p.runtime !== state.profiles[i].runtime)) {
                set({ profiles: normalized });
            }

            state.profileStore.save(normalized);

            const config: LauncherConfig = {
                keep_open: state.keepLauncherOpen,
                ui_theme: state.UITheme,
                developer_mode: state.developerMode,
                last_launched_profile_uuid: state.lastLaunchedProfileUuid,
            };
            writeLauncherConfig(paths.launcherConfigPath, config);
        },

        platform,
        versions,
        profileStore: new ProfileStore(paths.profilesFilePath),
        fileLocker: FileLocker.create(),
    };
});

async function hydrate(): Promise<void> {
    const { platform, versions, profileStore, refreshAllMods, refreshInstalledVersions } = useAppStore.getState();

    versions.library.load();
    versions.library.prune();
    refreshInstalledVersions();

    const profiles = profileStore.load();
    const config = readLauncherConfig(platform.getPaths().launcherConfigPath);

    useAppStore.setState({
        profiles,
        keepLauncherOpen: config.keep_open,
        developerMode: config.developer_mode,
        UITheme: config.ui_theme,
        lastLaunchedProfileUuid: config.last_launched_profile_uuid,
    });

    versions.subscribe("installed", refreshInstalledVersions);
    versions.subscribe("uninstalled", refreshInstalledVersions);

    ipcRenderer.send("WINDOW_UI_THEME", useAppStore.getState().UITheme);
    refreshAllMods();
}

export function InitializeAppState(): void {
    ipcRenderer.removeAllListeners("APP_STATE_INIT");
    ipcRenderer.on("APP_STATE_INIT", async () => {
        // Bad on-disk state now throws instead of being papered over, so it has to
        // reach the user here rather than dying as an unhandled rejection.
        try {
            await hydrate();
        } catch (e) {
            console.error("[AppStore] Startup failed:", e);
            useAppStore.setState({ error: `Startup failed: ${(e as Error).message ?? e}` });
            return;
        }
        resumePendingDownloads();
    });
    ipcRenderer.send("APP_STATE_INIT_REQUEST");
}

InitializeAppState();
