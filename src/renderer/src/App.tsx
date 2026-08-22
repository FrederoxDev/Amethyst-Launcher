import { useAppStore } from "@renderer/states/AppStore";
import { Link, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { describeError, userMessage } from "@shared/diagnostics/Log";
import { Popup } from "@renderer/states/PopupStore";
import { createProfileFlow } from "@renderer/flows/CreateProfile";
import { adoptAllForeignGameData } from "@renderer/flows/AdoptGameData";
import { removeRetiredDotnet } from "@renderer/scripts/backend/RetiredTools";
import { isModded } from "@renderer/scripts/domain/Profile";
import { log } from "@renderer/scripts/LauncherLog";

import lushCaveImage from "@renderer/assets/images/art/lush_cave.jpg";
import craftingIcon from "@renderer/assets/images/icons/crafting-icon.png";
import earthIcon from "@renderer/assets/images/icons/earth-icon.png";
import settingsIcon from "@renderer/assets/images/icons/settings-icon.png";

import { DropWindow } from "@renderer/components/DropWindow";
import { ErrorBanner } from "@renderer/components/ErrorBanner";
import Title from "@renderer/components/Title";

import { LauncherPage } from "@renderer/pages/LauncherPage";
import { SettingsPopup } from "@renderer/popups/SettingsPopup";
import { UpdatePage } from "@renderer/pages/UpdatePage";
import PopupRenderer from "./components/PopupRenderer";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import LoadingSpinnerRenderer from "./components/LoadingSpinnerRenderer";
import ProgressBarRenderer from "./components/ProgressBarRenderer";
import { removePendingDownload, useDownloadStore } from "@renderer/states/DownloadStore";
import { MOD_DISCOVERY_ENABLED } from "@renderer/scripts/FeatureFlags";

const fs = window.require("fs") as typeof import("fs");

const ModDiscovery = lazy(() => import("@renderer/pages/ModDiscovery").then(m => ({ default: m.ModDiscovery })));
const ModsPage = lazy(() => import("@renderer/pages/ModsPage").then(m => ({ default: m.ModsPage })));
const ProfileEditor = lazy(() => import("@renderer/pages/ProfileEditor").then(m => ({ default: m.ProfileEditor })));
const ProfilePage = lazy(() => import("@renderer/pages/ProfilePage").then(m => ({ default: m.ProfilePage })));
const VersionPage = lazy(() => import("@renderer/pages/VersionPage").then(m => ({ default: m.VersionPage })));
const LogsPage = lazy(() => import("@renderer/pages/LogsPage").then(m => ({ default: m.LogsPage })));

function DownloadManagerButton() {
    const downloads = useDownloadStore(state => state.downloads);
    const panelOpen = useDownloadStore(state => state.panelOpen);
    const setPanelOpen = useDownloadStore(state => state.setPanelOpen);
    const removeDownload = useDownloadStore(state => state.removeDownload);

    const btnRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [panelPos, setPanelPos] = useState({ bottom: 0, left: 0 });

    const activeCount = downloads.filter(d => d.status === "downloading" || d.status === "extracting" || d.status === "queued").length;

    useEffect(() => {
        if (!panelOpen) return;
        const handleClick = (e: MouseEvent) => {
            if (
                btnRef.current && !btnRef.current.contains(e.target as Node) &&
                panelRef.current && !panelRef.current.contains(e.target as Node)
            ) {
                setPanelOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [panelOpen, setPanelOpen]);

    useEffect(() => {
        if (!panelOpen || !btnRef.current) return;
        const rect = btnRef.current.getBoundingClientRect();
        setPanelPos({
            bottom: window.innerHeight - rect.bottom,
            left: rect.right + 10,
        });
    }, [panelOpen]);

    // Cancelling has to clear the crash-recovery record too, or the next start resumes what
    // the user just stopped.
    const cancelDownload = (id: string) => {
        const dl = downloads.find(d => d.id === id);
        if (!dl) {
            log("Downloads", `Dismissed download ${id}, which is no longer in the list`);
        }
        else if (dl.abortController) {
            log("Downloads", `User cancelled "${dl.name}" (${id}) at ${Math.round(dl.progress * 100)}%, status ${dl.status}`);
            dl.abortController.abort();
        }
        else {
            log("Downloads", `Removed "${dl.name}" (${id}) from the list; status ${dl.status} carries nothing to abort`);
        }
        removePendingDownload(id);
        removeDownload(id);
    };

    return (
        <div className="download-manager-btn" ref={btnRef} onClick={() => setPanelOpen(!panelOpen)}>
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round">
                <path d="M8 2v8M4.5 7.5L8 11l3.5-3.5M2 14h12" />
            </svg>
            {activeCount > 0 && <div className="download-manager-badge" />}

            {panelOpen && createPortal(
                <div
                    className="download-manager-panel"
                    ref={panelRef}
                    style={{ bottom: panelPos.bottom, left: panelPos.left }}
                    onClick={e => e.stopPropagation()}
                >
                    <p className="minecraft-seven download-manager-title">Downloads</p>
                    <div className="download-manager-list scrollbar">
                        {downloads.length === 0 && (
                            <p className="minecraft-seven download-manager-empty">No downloads</p>
                        )}
                        {downloads.map(dl => (
                            <div key={dl.id} className="download-manager-item">
                                <div className="download-manager-item-info">
                                    <p className="minecraft-seven download-manager-item-name">{dl.name}</p>
                                    <p className="minecraft-seven download-manager-item-status">
                                        {dl.status === "downloading" ? `${Math.round(dl.progress * 100)}%` : dl.status}
                                    </p>
                                </div>
                                <div className="download-manager-progress-track">
                                    <div
                                        className={`download-manager-progress-fill ${dl.status === "error" ? "download-manager-progress-error" : ""}`}
                                        style={{ width: `${Math.round(dl.progress * 100)}%` }}
                                    />
                                </div>
                                {(dl.status === "downloading" || dl.status === "queued") && (
                                    <div className="download-manager-item-cancel" onClick={() => cancelDownload(dl.id)}>
                                        <svg width="10" height="10" viewBox="0 0 12 12">
                                            <path d="M2 2L10 10M10 2L2 10" stroke="#9f9f9f" strokeWidth="2" strokeLinecap="round" />
                                        </svg>
                                    </div>
                                )}
                                {(dl.status === "done" || dl.status === "error") && (
                                    <div className="download-manager-item-cancel" onClick={() => removeDownload(dl.id)}>
                                        <svg width="10" height="10" viewBox="0 0 12 12">
                                            <path d="M2 2L10 10M10 2L2 10" stroke="#9f9f9f" strokeWidth="2" strokeLinecap="round" />
                                        </svg>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

function AnimatedRoutes() {
    const location = useLocation();
    const [displayLocation, setDisplayLocation] = useState(location);
    const isExiting = location.pathname !== displayLocation.pathname;
    const transitionClass = isExiting ? "page-exit-active" : "page-enter-active";

    useEffect(() => {
        if (!isExiting) return undefined;
        const timer = setTimeout(() => setDisplayLocation(location), 80);
        return () => clearTimeout(timer);
    }, [location, isExiting]);

    return (
        <div className={`page-transition ${transitionClass}`}>
            <Suspense>
                <Routes location={displayLocation}>
                    <Route path="/" element={<LauncherPage />} />
                    <Route path="/profiles" element={<ProfilePage />} />
                    <Route path="/profile-editor" element={<ProfileEditor />} />
                    <Route path="/mods" element={<ModsPage />} />
                    <Route path="/versions" element={<VersionPage />} />
                    {MOD_DISCOVERY_ENABLED && <Route path="/mod-discovery" element={<ModDiscovery />} />}
                    <Route path="/logs" element={<LogsPage />} />
                </Routes>
            </Suspense>
        </div>
    );
}

export default function App() {
    const location = useLocation();
    const navigate = useNavigate();
    const onboardingStarted = useRef(false);

    useEffect(() => {
        setTimeout(() => {
            useAppStore.getState().versions.cleanupStaleLocks().catch(e => {
                log("App", `Stale lock sweep failed: ${describeError(e)}`);
            });
            removeRetiredDotnet().catch(e => {
                log("App", `Retired .NET sweep failed: ${describeError(e)}`);
            });
        }, 0);
    }, []);

    useEffect(() => {
        // Guard against React StrictMode double-mount in dev (and any future
        // remount). Once we've kicked off onboarding, never kick it off again
        // from this tree.
        if (onboardingStarted.current) {
            log("App", "Onboarding already started for this tree, not starting it again");
            return;
        }
        onboardingStarted.current = true;
        adoptAllForeignGameData().catch(e => {
            log("App", `Resolving existing game data failed: ${describeError(e)}`);
            useAppStore.getState().setError(`Could not resolve existing game data: ${userMessage(e)}`);
        });
    }, []);

    useEffect(() => {
        const state = useAppStore.getState();
        const modsPath = state.platform.getPaths().modsPath;

        try {
            if (!fs.existsSync(modsPath)) {
                log("App", `Creating the mods folder ${modsPath}`);
                fs.mkdirSync(modsPath, { recursive: true });
            }
        } catch (e) {
            log("App", `No mods folder watcher: ${modsPath} could not be created: ${describeError(e)}`);
            return;
        }

        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        const scheduleRefresh = () => {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }

            debounceTimer = setTimeout(() => {
                useAppStore.getState().refreshAllMods();
                debounceTimer = null;
            }, 200);
        };

        let watcher: import("fs").FSWatcher | null = null;
        try {
            watcher = fs.watch(modsPath, { persistent: false }, () => {
                scheduleRefresh();
            });
            log("App", `Watching ${modsPath} for mod changes`);
        } catch (e) {
            log("App", `No mods folder watcher: fs.watch on ${modsPath} failed: ${describeError(e)}`);
            return;
        }

        // Keep the store aligned with disk state on startup.
        scheduleRefresh();

        return () => {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }

            watcher?.close();
        };
    }, []);

    return (
        <>
            <link rel="preload" href={lushCaveImage} as="image" />

            <div className="container app-root">
                <Title />

                <div className="launcher_background app-background-layer">
                    <img src={lushCaveImage} className="app-background-image" alt="" />
                </div>

                <div className="contents_container app-contents">
                    <div className="navbar_container app-navbar-container">
                        <div className="app-navbar">
                            <div className="app-nav-links">
                                <Link to="/" draggable={false}>
                                    <div
                                        className={`nav-icon ${location.pathname === "/" ? "nav-icon--active" : ""}`}
                                    >
                                        <img
                                            src={craftingIcon}
                                            className="app-nav-icon-image pixelated"
                                            alt=""
                                        />
                                    </div>
                                </Link>
                                {MOD_DISCOVERY_ENABLED && (
                                    <Link to="/mod-discovery" draggable={false}>
                                        <div
                                            className={`nav-icon ${location.pathname === "/mod-discovery" ? "nav-icon--active" : ""}`}
                                        >
                                            <img
                                                src={earthIcon}
                                                className="app-nav-icon-image pixelated"
                                                alt=""
                                            />
                                        </div>
                                    </Link>
                                )}
                                <div
                                    className="nav-icon nav-icon-add"
                                    onClick={async () => {
                                        const result = await createProfileFlow();
                                        if (!result) return;
                                        navigate(isModded(result.profile) ? "/profile-editor" : "/");
                                    }}
                                >
                                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                        <path d="M10 4V16M4 10H16" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="square" />
                                    </svg>
                                </div>
                            </div>

                            <Link to="/logs" draggable={false}>
                                <div className={`app-logs-button${location.pathname === "/logs" ? " app-logs-button--active" : ""}`}>
                                    <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
                                        <path d="M4 2h8l4 4v12H4V2z" stroke="#FFFFFF" strokeWidth="1.5" fill="none" />
                                        <path d="M12 2v4h4" stroke="#FFFFFF" strokeWidth="1.5" fill="none" />
                                        <path d="M6.5 10h7M6.5 13h7M6.5 16h5" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="square" />
                                    </svg>
                                </div>
                            </Link>

                            <DownloadManagerButton />

                            <div className="app-settings-button" onClick={() => {
                                Popup.ask<void>(props => <SettingsPopup {...props} />);
                            }}>
                                <img
                                    src={settingsIcon}
                                    className="app-settings-icon pixelated"
                                    alt=""
                                />
                            </div>
                        </div>
                    </div>
                    <div className="view_container app-view-container">
                        <ErrorBanner />
                        <div className="app-view-content">
                            <AnimatedRoutes />
                            <UpdatePage></UpdatePage>
                            <DropWindow></DropWindow>
                            <div className="launcher-footer">
                                <div className="launcher-disclaimer">
                                    <p className="minecraft-seven launcher-disclaimer-text">
                                        Not approved by or associated with Mojang or Microsoft
                                    </p>
                                </div>
                            </div>
                        </div>
                        <ProgressBarRenderer />
                    </div>
                </div>
            </div>

            <PopupRenderer />
            <LoadingSpinnerRenderer />
        </>
    );
}
