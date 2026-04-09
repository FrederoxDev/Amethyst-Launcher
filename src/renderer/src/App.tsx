import { AnalyticsConsent, useAppStore } from "@renderer/states/AppStore";
import { Link, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Popup } from "@renderer/states/PopupStore";
import { createProfileFlow } from "@renderer/scripts/ProfileCreation";

import lushCaveImage from "@renderer/assets/images/art/lush_cave.png";
import craftingIcon from "@renderer/assets/images/icons/crafting-icon.png";
import earthIcon from "@renderer/assets/images/icons/earth-icon.png";
import settingsIcon from "@renderer/assets/images/icons/settings-icon.png";

import { DropWindow } from "@renderer/components/DropWindow";
import Title from "@renderer/components/Title";

import { LauncherPage } from "@renderer/pages/LauncherPage";
import { ModDiscovery } from "@renderer/pages/ModDiscovery";
import { ModsPage } from "@renderer/pages/ModsPage";
import { ProfileEditor } from "@renderer/pages/ProfileEditor";
import { ProfilePage } from "@renderer/pages/ProfilePage";
import { SettingsPopup } from "@renderer/popups/SettingsPopup";
import { UpdatePage } from "@renderer/pages/UpdatePage";
import { VersionPage } from "@renderer/pages/VersionPage";
import PopupRenderer from "./components/PopupRenderer";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import LoadingSpinnerRenderer from "./components/LoadingSpinnerRenderer";
import ProgressBarRenderer from "./components/ProgressBarRenderer";
import { useDownloadStore } from "@renderer/states/DownloadStore";
import { AskAnalyticsConsent } from "./components/AnalyticsConsentPanel";

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
    }, [panelOpen]);

    useEffect(() => {
        if (!panelOpen || !btnRef.current) return;
        const rect = btnRef.current.getBoundingClientRect();
        setPanelPos({
            bottom: window.innerHeight - rect.bottom,
            left: rect.right + 10,
        });
    }, [panelOpen]);

    const cancelDownload = (id: string) => {
        const dl = downloads.find(d => d.id === id);
        if (dl?.abortController) {
            dl.abortController.abort();
        }
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
    const [transitionClass, setTransitionClass] = useState("page-enter-active");

    useEffect(() => {
        if (location.pathname !== displayLocation.pathname) {
            setTransitionClass("page-exit-active");
            const timer = setTimeout(() => {
                setDisplayLocation(location);
                setTransitionClass("page-enter-active");
            }, 80);
            return () => clearTimeout(timer);
        }
    }, [location, displayLocation]);

    return (
        <div className={`page-transition ${transitionClass}`}>
            <Routes location={displayLocation}>
                <Route path="/" element={<LauncherPage />} />
                <Route path="/profiles" element={<ProfilePage />} />
                <Route path="/profile-editor" element={<ProfileEditor />} />
                <Route path="/mods" element={<ModsPage />} />
                <Route path="/versions" element={<VersionPage />} />
                <Route path="/mod-discovery" element={<ModDiscovery />} />
            </Routes>
        </div>
    );
}

export default function App() {
    const location = useLocation();
    const navigate = useNavigate();
    useEffect(() => {
        useAppStore.getState().versionManager.cleanupStaleLocks();

        const currentConsent = useAppStore.getState().analyticsConsent;
        if (currentConsent !== AnalyticsConsent.Unknown)
            return;

        AskAnalyticsConsent().then(consent => {
            if (!consent || consent === AnalyticsConsent.Unknown)
                return;
            useAppStore.getState().setAnalyticsConsent(consent);
        });
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
                                <div
                                    className="nav-icon nav-icon-add"
                                    onClick={async () => {
                                        const result = await createProfileFlow();
                                        if (!result) return;
                                        navigate(result.profile.is_modded ? "/profile-editor" : "/");
                                    }}
                                >
                                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                        <path d="M10 4V16M4 10H16" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="square" />
                                    </svg>
                                </div>
                            </div>

                            <DownloadManagerButton />

                            <div className="app-settings-button" onClick={() => {
                                Popup.useAsync<void>(props => <SettingsPopup {...props} />);
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
