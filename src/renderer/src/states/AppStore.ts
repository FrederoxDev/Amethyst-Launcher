import { Analytics, getAnalytics } from "firebase/analytics";
import { create } from "zustand";

import { describeError, userMessage } from "@shared/diagnostics/Log";
import { log } from "@renderer/scripts/LauncherLog";
import { LauncherConfig, readLauncherConfig, writeLauncherConfig } from "@renderer/scripts/Launcher";
import { GetAllMods, ValidatedMod } from "@renderer/scripts/Mods";
import { ProfileStore } from "@renderer/scripts/ProfileStore";
import { CHANNELS } from "@renderer/scripts/domain/Channel";
import { Profile } from "@renderer/scripts/domain/Profile";
import { ILauncherPlatform } from "@renderer/scripts/platform/LauncherPlatform";
import { WindowsLauncherPlatform } from "@renderer/scripts/platform/WindowsLauncherPlatform";
import { LinuxLauncherPlatform } from "@renderer/scripts/platform/LinuxLauncherPlatform";
import { updateSessionDeveloperMode } from "@renderer/scripts/session/Session";
import { InstalledVersion } from "@renderer/scripts/versions/InstalledVersion";
import { VersionService } from "@renderer/scripts/versions/VersionService";
import { FileLocker } from "@renderer/scripts/FileLocker";
import { takeStartupNotices } from "@renderer/scripts/Utility";
import { StateSetter, StateUtils } from "./StateUtils";
import { resumePendingDownloads } from "@renderer/scripts/DownloadRecovery";
import { firebaseApp } from "@renderer/firebase/Firebase";

const { ipcRenderer } = window.require("electron") as typeof import("electron");

export enum AnalyticsConsent {
    Unknown = "Unknown",
    Accepted = "Accepted",
    Declined = "Declined",
}

/**
 * Consent lives in localStorage rather than the launcher config: it must be known before the
 * config is read, and a quarantined config must never silently re-enable analytics.
 */
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

    editingProfileUuid: string | null;
    setEditingProfileUuid: StateSetter<string | null>;

    UITheme: string;
    setUITheme: StateSetter<string>;

    keepLauncherOpen: boolean;
    setKeepLauncherOpen: StateSetter<boolean>;

    developerMode: boolean;
    setDeveloperMode: StateSetter<boolean>;

    autoCheckUpdates: boolean;
    setAutoCheckUpdates: StateSetter<boolean>;

    confirmDelete: boolean;
    setConfirmDelete: StateSetter<boolean>;

    trustAllMods: boolean;
    setTrustAllMods: StateSetter<boolean>;

    showConsole: boolean;
    setShowConsole: StateSetter<boolean>;

    hardwareAcceleration: boolean;
    setHardwareAcceleration: StateSetter<boolean>;

    nativeDecorations: boolean;
    setNativeDecorations: StateSetter<boolean>;

    analyticsConsent: AnalyticsConsent;
    setAnalyticsConsent: StateSetter<AnalyticsConsent>;

    analyticsInstance: Analytics | null;

    error: string;
    setError: StateSetter<string>;
    /** A failure the user has to act on. It stays on screen until they dismiss it. */
    setFatalError: (message: string) => void;

    downloadingMods: string[];
    setDownloadingMods: StateSetter<string[]>;

    installingForProfile: string | null;
    setInstallingForProfile: StateSetter<string | null>;

    saveData: () => void;
    refreshAllMods: () => void;

    platform: ILauncherPlatform;
    versions: VersionService;
    profileStore: ProfileStore;
    fileLocker: FileLocker;
}

/**
 * `saveData` serialises the whole in-memory state over the user's files, so it is only ever a
 * rewrite of what hydration read. Before that, and after a read that failed, there is nothing
 * to rewrite and the state it would write is the app's defaults.
 */
type WriteGate = "held until startup has read the files" | "open" | "closed by a failed startup";

let writeGate: WriteGate = "held until startup has read the files";

/** Set while a banner must survive whatever fails in the background afterwards. */
let stickyError = "";

function updateLiveSessionsDeveloperMode(platform: ILauncherPlatform, developerMode: boolean): void {
    for (const channel of CHANNELS) {
        const profileUuid = platform.liveProfileFor(channel);
        if (!profileUuid) continue;
        updateSessionDeveloperMode(platform.profileDataDir(profileUuid), developerMode);
    }
}

export const useAppStore = create<AppStore>((set, get) => {
    const platform = createPlatform();
    const paths = platform.getPaths();
    const versions = new VersionService(paths);
    const initialConsent = getInitialAnalyticsConsent();

    return {
        allMods: [],
        allValidMods: [],
        allInvalidMods: [],
        allRuntimes: [],
        profiles: [],
        installedVersions: [],
        lastLaunchedProfileUuid: null,
        editingProfileUuid: null,
        UITheme: "System",
        keepLauncherOpen: true,
        developerMode: false,
        autoCheckUpdates: true,
        confirmDelete: true,
        trustAllMods: false,
        showConsole: false,
        hardwareAcceleration: true,
        nativeDecorations: false,
        analyticsConsent: initialConsent,
        analyticsInstance: getAnalyticsInstanceForConsent(initialConsent),
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

        setEditingProfileUuid: value =>
            set(state => ({ editingProfileUuid: StateUtils.resolveSetStateAction(value, state.editingProfileUuid) })),

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
                if (next !== state.keepLauncherOpen)
                    log("Settings", `Keep launcher open: ${state.keepLauncherOpen} -> ${next}`);
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
            updateLiveSessionsDeveloperMode(platform, get().developerMode);
        },

        setAutoCheckUpdates: value => {
            set(state => ({ autoCheckUpdates: StateUtils.resolveSetStateAction(value, state.autoCheckUpdates) }));
            get().saveData();
        },

        setConfirmDelete: value => {
            set(state => ({ confirmDelete: StateUtils.resolveSetStateAction(value, state.confirmDelete) }));
            get().saveData();
        },

        setTrustAllMods: value => {
            set(state => ({ trustAllMods: StateUtils.resolveSetStateAction(value, state.trustAllMods) }));
            get().saveData();
        },

        setShowConsole: value => {
            set(state => ({ showConsole: StateUtils.resolveSetStateAction(value, state.showConsole) }));
            get().saveData();
        },

        setHardwareAcceleration: value => {
            set(state => ({
                hardwareAcceleration: StateUtils.resolveSetStateAction(value, state.hardwareAcceleration),
            }));
            get().saveData();
        },

        setNativeDecorations: value => {
            set(state => ({
                nativeDecorations: StateUtils.resolveSetStateAction(value, state.nativeDecorations),
            }));
            get().saveData();
        },

        // Not written through saveData: consent has to hold even when the write gate is shut.
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

        // Every banner the user is shown is recorded, so a screenshot of one can be matched
        // to the run that produced it.
        setError: value =>
            set(state => {
                const next = StateUtils.resolveSetStateAction(value, state.error);
                if (next === "") {
                    stickyError = "";
                    return { error: "" };
                }
                if (stickyError !== "" && next !== stickyError) {
                    log("AppStore", `Not replacing the banner "${stickyError}" with: ${next}`);
                    return { error: stickyError };
                }
                if (next !== state.error) log("AppStore", `Showing error banner: ${next}`);
                return { error: next };
            }),

        setFatalError: message => {
            stickyError = message;
            log("AppStore", `Showing error banner until the user dismisses it: ${message}`);
            set({ error: message });
        },

        setDownloadingMods: value =>
            set(state => ({ downloadingMods: StateUtils.resolveSetStateAction(value, state.downloadingMods) })),

        setInstallingForProfile: value =>
            set(state => ({
                installingForProfile: StateUtils.resolveSetStateAction(value, state.installingForProfile),
            })),

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
            if (writeGate !== "open") {
                log("AppStore", `REFUSING to save: writes are ${writeGate}, so this state is not the user's own`);
                return;
            }

            const state = get();

            state.profileStore.save(state.profiles);

            const config: LauncherConfig = {
                keep_open: state.keepLauncherOpen,
                ui_theme: state.UITheme,
                developer_mode: state.developerMode,
                last_launched_profile_uuid: state.lastLaunchedProfileUuid,
                auto_check_updates: state.autoCheckUpdates,
                confirm_delete: state.confirmDelete,
                trust_all_mods: state.trustAllMods,
                show_console: state.showConsole,
                hardware_acceleration: state.hardwareAcceleration,
                native_decorations: state.nativeDecorations,
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
        autoCheckUpdates: config.auto_check_updates,
        confirmDelete: config.confirm_delete,
        trustAllMods: config.trust_all_mods,
        showConsole: config.show_console,
        hardwareAcceleration: config.hardware_acceleration,
        nativeDecorations: config.native_decorations,
    });

    writeGate = "open";
    log("AppStore", "Saving is now allowed: every file a save rewrites has been read");

    versions.subscribe("installed", refreshInstalledVersions);
    versions.subscribe("uninstalled", refreshInstalledVersions);

    ipcRenderer.send("WINDOW_UI_THEME", useAppStore.getState().UITheme);

    hydratePhase = "scanning the mods folder";
    refreshAllMods();

    hydratePhase = "done";
    const state = useAppStore.getState();
    log(
        "AppStore",
        `Startup finished: ${state.profiles.length} profiles, ${state.installedVersions.length} installed versions, ` +
            `${state.allValidMods.length} valid mods, ${state.allInvalidMods.length} invalid mods, ` +
            `last launched ${state.lastLaunchedProfileUuid ?? "none"}`
    );

    // Anything a loader had to move aside is the user's to know about, in their own words.
    const notices = takeStartupNotices();
    if (notices.length > 0) {
        log("AppStore", `Startup moved ${notices.length} unreadable file(s) aside`);
        state.setError(notices.join("\n\n"));
    }
}

export function initializeAppState(): void {
    ipcRenderer.removeAllListeners("APP_STATE_INIT");
    ipcRenderer.on("APP_STATE_INIT", async () => {
        log("AppStore", "APP_STATE_INIT received, loading state from disk");
        // A throw from hydration is the user's news, not an unhandled rejection.
        try {
            await hydrate();
        } catch (e) {
            writeGate = "closed by a failed startup";
            log("AppStore", `Startup failed while ${hydratePhase}: ${describeError(e)}`);
            useAppStore
                .getState()
                .setFatalError(
                    `Startup failed while ${hydratePhase}: ${userMessage(e)}. ` +
                        "Nothing you change will be saved until this is fixed, so your files stay as they are."
                );
            return;
        } finally {
            // Tell the main process the renderer has hydrated and is painting real content, so it
            // can reveal the window. This runs from JS, so unlike "ready-to-show" it does not
            // depend on the GPU/compositor - that event never fires on some Linux setups, which
            // left the window hidden forever. In `finally` so a failed startup still shows the
            // error banner instead of nothing at all.
            requestAnimationFrame(() => ipcRenderer.send("RENDERER_READY"));
        }
        resumePendingDownloads();
    });
    log("AppStore", "Asking the main process for APP_STATE_INIT");
    ipcRenderer.send("APP_STATE_INIT_REQUEST");
}

initializeAppState();
