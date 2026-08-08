import { create } from "zustand";

import { describeError } from "@shared/diagnostics/Log";
import { log } from "@renderer/scripts/LauncherLog";
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
import { takeStartupNotices } from "@renderer/scripts/Utility";
import { StateSetter, StateUtils } from "./StateUtils";
import { resumePendingDownloads } from "@renderer/scripts/DownloadRecovery";

const { ipcRenderer } = window.require("electron") as typeof import("electron");

function createPlatform(): ILauncherPlatform {
    if (process.platform === "win32") {
        log("AppStore", "Platform backend: Windows");
        return new WindowsLauncherPlatform();
    }
    if (process.platform === "linux") {
        log("AppStore", "Platform backend: Linux");
        return new LinuxLauncherPlatform();
    }
    log("AppStore", `No platform backend for process.platform "${process.platform}"`);
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
            const previous = get().lastLaunchedProfileUuid;
            if (previous !== uuid) log("AppStore", `lastLaunchedProfileUuid: ${previous} -> ${uuid}`);
            set({ lastLaunchedProfileUuid: uuid });
            get().saveData();
        },

        setEditingProfileIndex: value =>
            set(state => ({ editingProfileIndex: StateUtils.resolveSetStateAction(value, state.editingProfileIndex) })),

        setUITheme: value => {
            set(state => {
                const next = StateUtils.resolveSetStateAction(value, state.UITheme);
                if (next !== state.UITheme) log("Settings", `UI theme: ${state.UITheme} -> ${next}`);
                ipcRenderer.send("WINDOW_UI_THEME", next);
                return { UITheme: next };
            });
            get().saveData();
        },

        setKeepLauncherOpen: value => {
            set(state => {
                const next = StateUtils.resolveSetStateAction(value, state.keepLauncherOpen);
                if (next !== state.keepLauncherOpen) log("Settings", `Keep launcher open: ${state.keepLauncherOpen} -> ${next}`);
                return { keepLauncherOpen: next };
            });
            get().saveData();
        },

        setDeveloperMode: value => {
            set(state => {
                const next = StateUtils.resolveSetStateAction(value, state.developerMode);
                if (next !== state.developerMode) log("Settings", `Developer mode: ${state.developerMode} -> ${next}`);
                return { developerMode: next };
            });
            get().saveData();
        },

        // Every banner the user is shown is recorded, so a screenshot of one can be matched
        // to the run that produced it.
        setError: value => set(state => {
            const next = StateUtils.resolveSetStateAction(value, state.error);
            if (next !== state.error && next !== "") log("AppStore", `Showing error banner: ${next}`);
            return { error: next };
        }),

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

/** Names the step in flight so a throw says which one failed, not just that startup did. */
let hydratePhase = "not started";

async function hydrate(): Promise<void> {
    const { platform, versions, profileStore, refreshAllMods, refreshInstalledVersions } = useAppStore.getState();
    const paths = platform.getPaths();

    hydratePhase = "reading the installed-version library";
    versions.library.load();

    hydratePhase = "pruning installed versions whose folder is gone";
    versions.library.prune();
    refreshInstalledVersions();

    hydratePhase = `reading profiles from ${paths.profilesFilePath}`;
    const profiles = profileStore.load();

    hydratePhase = `reading the launcher config from ${paths.launcherConfigPath}`;
    const config = readLauncherConfig(paths.launcherConfigPath);

    hydratePhase = "applying the loaded state";
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

    hydratePhase = "scanning the mods folder";
    refreshAllMods();

    hydratePhase = "done";
    const state = useAppStore.getState();
    log(
        "AppStore",
        `Startup finished: ${state.profiles.length} profiles, ${state.installedVersions.length} installed versions, `
        + `${state.allValidMods.length} valid mods, ${state.allInvalidMods.length} invalid mods, `
        + `last launched ${state.lastLaunchedProfileUuid ?? "none"}`
    );

    // Anything a loader had to move aside is the user's to know about, in their own words.
    const notices = takeStartupNotices();
    if (notices.length > 0) {
        log("AppStore", `Startup moved ${notices.length} unreadable file(s) aside`);
        state.setError(notices.join("\n\n"));
    }
}

export function InitializeAppState(): void {
    ipcRenderer.removeAllListeners("APP_STATE_INIT");
    ipcRenderer.on("APP_STATE_INIT", async () => {
        log("AppStore", "APP_STATE_INIT received, loading state from disk");
        // Bad on-disk state now throws instead of being papered over, so it has to
        // reach the user here rather than dying as an unhandled rejection.
        try {
            await hydrate();
        } catch (e) {
            log("AppStore", `Startup failed while ${hydratePhase}: ${describeError(e)}`);
            useAppStore.setState({ error: `Startup failed: ${(e as Error).message ?? e}` });
            return;
        }
        resumePendingDownloads();
    });
    log("AppStore", "Asking the main process for APP_STATE_INIT");
    ipcRenderer.send("APP_STATE_INIT_REQUEST");
}

InitializeAppState();
