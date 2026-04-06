import { AnalyticsConsent, useAppStore } from "@renderer/states/AppStore";
import { Link, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Popup } from "@renderer/states/PopupStore";
import { runCreateProfileWizard } from "@renderer/scripts/ProfileWizard";

import lushCaveImage from "@renderer/assets/images/art/lush_cave.png";
import craftingIcon from "@renderer/assets/images/icons/crafting-icon.png";
import earthIcon from "@renderer/assets/images/icons/earth-icon.png";
import settingsIcon from "@renderer/assets/images/icons/settings-icon.png";

import { DropWindow } from "@renderer/components/DropWindow";
import Title from "@renderer/components/Title";
import { DownloadManagerButton } from "@renderer/components/DownloadManagerButton";

import { LauncherPage } from "@renderer/pages/LauncherPage";
import { ModDiscovery } from "@renderer/pages/ModDiscovery";
import { ModsPage } from "@renderer/pages/ModsPage";
import { ProfileEditor } from "@renderer/pages/ProfileEditor";
import { ProfilePage } from "@renderer/pages/ProfilePage";
import { SettingsPopup } from "@renderer/popups/SettingsPopup";
import { UpdatePage } from "@renderer/pages/UpdatePage";
import { VersionPage } from "@renderer/pages/VersionPage";
import PopupRenderer from "./components/PopupRenderer";
import { useEffect } from "react";
import LoadingSpinnerRenderer from "./components/LoadingSpinnerRenderer";
import ProgressBarRenderer from "./components/ProgressBarRenderer";
import { AskAnalyticsConsent } from "./components/AnalyticsConsentPanel";

export default function App() {
    const location = useLocation();
    const navigate = useNavigate();
    useEffect(() => {
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

                <div className="app-body">
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
                                        data-tooltip="Launcher"
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
                                        data-tooltip="Browse Mods"
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
                                    data-tooltip="New Instance"
                                    onClick={async () => {
                                        const newProfile = await runCreateProfileWizard();
                                        if (!newProfile) return;
                                        navigate(newProfile.is_modded ? "/profile-editor" : "/");
                                    }}
                                >
                                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                        <path d="M10 4V16M4 10H16" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="square" />
                                    </svg>
                                </div>
                            </div>

                            <DownloadManagerButton />

                            <div className="app-settings-button" data-tooltip="Settings" onClick={() => {
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
                            <Routes>
                                <Route path="/" element={<LauncherPage />} />
                                <Route path="/profiles" element={<ProfilePage />} />
                                <Route path="/profile-editor" element={<ProfileEditor />} />
                                <Route path="/mods" element={<ModsPage />} />
                                <Route path="/versions" element={<VersionPage />} />
                                <Route path="/mod-discovery" element={<ModDiscovery />} />
                            </Routes>

                            <UpdatePage></UpdatePage>
                            <DropWindow></DropWindow>
                        </div>
                        <ProgressBarRenderer />
                    </div>
                </div>

                <PopupRenderer />
                <LoadingSpinnerRenderer />
                </div>
            </div>
        </>
    );
}
