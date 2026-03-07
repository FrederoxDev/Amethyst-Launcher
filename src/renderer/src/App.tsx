import { AnalyticsConsent, useAppStore } from "@renderer/states/AppStore";
import { Link, Route, Routes, useLocation } from "react-router-dom";

import lushCaveImage from "@renderer/assets/images/art/lush_cave.png";
import bookshelfIcon from "@renderer/assets/images/icons/bookshelf-icon.png";
import chestIcon from "@renderer/assets/images/icons/chest-icon.png";
import craftingIcon from "@renderer/assets/images/icons/crafting-icon.png";
import portalIcon from "@renderer/assets/images/icons/portal-icon.png";
import settingsIcon from "@renderer/assets/images/icons/settings-icon.png";
import shulkerIcon from "@renderer/assets/images/icons/shulker-icon.png";

import { DropWindow } from "@renderer/components/DropWindow";
import Title from "@renderer/components/Title";

import { LauncherPage } from "@renderer/pages/LauncherPage";
import { ModDiscovery } from "@renderer/pages/ModDiscovery";
import { ModsPage } from "@renderer/pages/ModsPage";
import { ProfileEditor } from "@renderer/pages/ProfileEditor";
import { ProfilePage } from "@renderer/pages/ProfilePage";
import { SettingsPage } from "@renderer/pages/SettingsPage";
import { UpdatePage } from "@renderer/pages/UpdatePage";
import { VersionPage } from "@renderer/pages/VersionPage";
import PopupRenderer from "./components/PopupRenderer";
import { useEffect } from "react";
import LoadingSpinnerRenderer from "./components/LoadingSpinnerRenderer";
import { AskAnalyticsConsent } from "./components/AnalyticsConsentPanel";

export default function App() {
    const location = useLocation();
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
                                <Link to="/profiles" draggable={false}>
                                    <div
                                        className={`nav-icon ${location.pathname === "/profiles" ? "nav-icon--active" : ""}`}
                                    >
                                        <img
                                            src={chestIcon}
                                            className="app-nav-icon-image pixelated"
                                            alt=""
                                        />
                                    </div>
                                </Link>
                                <Link to="/mods" draggable={false}>
                                    <div
                                        className={`nav-icon ${location.pathname === "/mods" ? "nav-icon--active" : ""}`}
                                    >
                                        <img
                                            src={shulkerIcon}
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
                                            src={bookshelfIcon}
                                            className="app-nav-icon-image pixelated"
                                            alt=""
                                        />
                                    </div>
                                </Link>
                                <Link to="/versions" draggable={false}>
                                    <div
                                        className={`nav-icon ${location.pathname === "/versions" ? "nav-icon--active" : ""}`}
                                    >
                                        <img
                                            src={portalIcon}
                                            className="app-nav-icon-image pixelated"
                                            alt=""
                                        />
                                    </div>
                                </Link>
                            </div>

                            <Link to="/settings" draggable={false}>
                                <div className="app-settings-button">
                                    <img
                                        src={settingsIcon}
                                        className="app-settings-icon pixelated"
                                        alt=""
                                    />
                                    {location.pathname === "/settings" ? (
                                        <img
                                            src={settingsIcon}
                                            className="app-settings-icon pixelated"
                                            alt=""
                                        />
                                    ) : (
                                        <></>
                                    )}
                                </div>
                            </Link>
                        </div>
                    </div>
                    <div className="view_container app-view-container">
                        <Routes>
                            <Route path="/" element={<LauncherPage />} />
                            <Route path="/profiles" element={<ProfilePage />} />
                            <Route path="/profile-editor" element={<ProfileEditor />} />
                            <Route path="/mods" element={<ModsPage />} />
                            <Route path="/settings" element={<SettingsPage />} />
                            <Route path="/versions" element={<VersionPage />} />
                            <Route path="/mod-discovery" element={<ModDiscovery />} />
                        </Routes>

                        <UpdatePage></UpdatePage>
                        <DropWindow></DropWindow>
                    </div>
                </div>
            </div>

            <PopupRenderer />
            <LoadingSpinnerRenderer />
        </>
    );
}
