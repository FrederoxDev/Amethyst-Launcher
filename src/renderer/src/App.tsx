import { Link, Route, Routes, useLocation } from "react-router-dom";

import lushCaveImage from "@renderer/assets/images/art/lush_cave.png";
import bookshelfIcon from "@renderer/assets/images/icons/bookshelf-icon.png";
import chestIcon from "@renderer/assets/images/icons/chest-icon.png";
import craftingIcon from "@renderer/assets/images/icons/crafting-icon.png";
import portalIcon from "@renderer/assets/images/icons/portal-icon.png";
import settingsIcon from "@renderer/assets/images/icons/settings-icon.png";
import shulkerIcon from "@renderer/assets/images/icons/shulker-icon.png";

import { DropWindow } from "@renderer/components/DropWindow";
import { MainPanel, MainPanelSection, PanelIndent } from "@renderer/components/MainPanel";
import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { MinecraftButtonStyle } from "@renderer/components/MinecraftButtonStyle";
import { PopupPanel } from "@renderer/components/PopupPanel";
import Title from "@renderer/components/Title";

import { AnalyticsConsent, UseAppState } from "@renderer/contexts/AppState";

import { LauncherPage } from "@renderer/pages/LauncherPage";
import { ModDiscovery } from "@renderer/pages/ModDiscovery";
import { ModsPage } from "@renderer/pages/ModsPage";
import { ProfileEditor } from "@renderer/pages/ProfileEditor";
import { ProfilePage } from "@renderer/pages/ProfilePage";
import { SettingsPage } from "@renderer/pages/SettingsPage";
import { UpdatePage } from "@renderer/pages/UpdatePage";
import { VersionPage } from "@renderer/pages/VersionPage";

const { shell } = window.require("electron");

function GetAnalyticsConsent() {
    const analyticsConsent = UseAppState(state => state.analyticsConsent);
    const setAnalyticsConsent = UseAppState(state => state.setAnalyticsConsent);

    if (analyticsConsent !== AnalyticsConsent.Unknown) return <></>;

    return (
        <PopupPanel>
            <div className="app-consent-panel" onClick={e => e.stopPropagation()}>
                <MainPanel>
                    <MainPanelSection>
                        <p>Analytics Consent</p>
                        <PanelIndent className="app-consent-indent">
                            <p>
                                Amethyst Launcher uses Firebase Analytics to collect anonymized usage data to help
                                improve the launcher. The data collected may include:
                            </p>
                            <ul>
                                <p> - App interactions (e.g., mod downloads, button clicks)</p>
                                <p> - Device information (device type, OS version)</p>
                                <p> - Session and engagement data</p>
                            </ul>
                            <p>No personal information (like names or emails) is collected.</p>
                            <p>
                                By clicking “I Agree”, you consent to this data collection. You can later revoke consent
                                in the launcher settings.
                            </p>
                            <p>
                                For more details, see{" "}
                                <a
                                    href="https://firebase.google.com/support/privacy"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="app-consent-link"
                                    onClick={e => {
                                        e.preventDefault();
                                        shell.openExternal("https://firebase.google.com/support/privacy");
                                    }}
                                >
                                    Firebase Privacy & Security
                                </a>
                                .
                            </p>
                        </PanelIndent>
                        <div className="app-consent-actions">
                            <MinecraftButton
                                text="I Agree"
                                onClick={() => setAnalyticsConsent(AnalyticsConsent.Accepted)}
                            />
                            <MinecraftButton
                                text="Decline"
                                onClick={() => setAnalyticsConsent(AnalyticsConsent.Declined)}
                                style={MinecraftButtonStyle.Warn}
                            />
                        </div>
                    </MainPanelSection>
                </MainPanel>
            </div>
        </PopupPanel>
    );
}

export default function App() {
    const location = useLocation();

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

            <GetAnalyticsConsent />
        </>
    );
}
