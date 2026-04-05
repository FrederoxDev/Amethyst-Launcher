import React, { useState } from "react";

import { MinecraftRadialButtonPanel } from "@renderer/components/MinecraftRadialButtonPanel";
import { MinecraftToggle } from "@renderer/components/MinecraftToggle";

import { AnalyticsConsent, useAppStore } from "@renderer/states/AppStore";
import { AskAnalyticsConsent } from "@renderer/components/AnalyticsConsentPanel";

export function GeneralSettingsTab() {
    const keepLauncherOpen = useAppStore(state => state.keepLauncherOpen);
    const setKeepLauncherOpen = useAppStore(state => state.setKeepLauncherOpen);
    const developerMode = useAppStore(state => state.developerMode);
    const setDeveloperMode = useAppStore(state => state.setDeveloperMode);
    const UITheme = useAppStore(state => state.UITheme);
    const setUITheme = useAppStore(state => state.setUITheme);
    const analyticsConsent = useAppStore(state => state.analyticsConsent);
    const setAnalyticsConsent = useAppStore(state => state.setAnalyticsConsent);
    const trustAllMods = useAppStore(state => state.trustAllMods);
    const setTrustAllMods = useAppStore(state => state.setTrustAllMods);

    return (
        <div className="settings-page settings-scroll-hidden">
            <div className="settings-section">
                <div className="settings-row">
                    <div>
                        <p className="minecraft-seven settings-title">Analytics Consent</p>
                        <p className="minecraft-seven settings-subtitle">
                            Send anonymous usage data to help improve the launcher.
                        </p>
                    </div>
                    <div className="settings-toggle-wrap">
                        <MinecraftToggle
                            isChecked={analyticsConsent === AnalyticsConsent.Accepted}
                            setIsChecked={isChecked => {
                                if (!isChecked) {
                                    setAnalyticsConsent(AnalyticsConsent.Declined);
                                    return;
                                }

                                AskAnalyticsConsent().then(consent => {
                                    if (!consent || consent === AnalyticsConsent.Unknown) return;
                                    setAnalyticsConsent(consent);
                                });
                            }}
                        />
                    </div>
                </div>
                <div className="settings-row">
                    <div>
                        <p className="minecraft-seven settings-title">Keep launcher open</p>
                        <p className="minecraft-seven settings-subtitle">
                            Prevents the launcher from closing after launching the game.
                        </p>
                    </div>
                    <div className="settings-toggle-wrap">
                        <MinecraftToggle isChecked={keepLauncherOpen} setIsChecked={setKeepLauncherOpen} />
                    </div>
                </div>
                <div className="settings-row">
                    <div>
                        <p className="minecraft-seven settings-title">Developer mode</p>
                        <p className="minecraft-seven settings-subtitle">
                            Enables hot-reloading and prompting to attach a debugger.
                        </p>
                    </div>
                    <div className="settings-toggle-wrap">
                        <MinecraftToggle isChecked={developerMode} setIsChecked={setDeveloperMode} />
                    </div>
                </div>
            </div>

            <div className="version-picker-divider" />

            <div className="settings-regular">
                <p className="minecraft-seven settings-title">UI Theme</p>
                <MinecraftRadialButtonPanel
                    elements={[
                        { text: "Light", value: "Light" },
                        { text: "Dark", value: "Dark" },
                        { text: "System", value: "System" },
                    ]}
                    default_selected_value={UITheme}
                    onChange={value => {
                        setUITheme(value);
                    }}
                />
            </div>

            <div className="version-picker-divider" />

            <div className="settings-section">
                <div className="settings-row">
                    <div>
                        <p className="minecraft-seven settings-title">Trust all community mods</p>
                        <p className="minecraft-seven settings-subtitle">
                            Skip the safety warning when installing mods not published by the Amethyst team.
                        </p>
                    </div>
                    <div className="settings-toggle-wrap">
                        <MinecraftToggle isChecked={trustAllMods} setIsChecked={setTrustAllMods} />
                    </div>
                </div>
            </div>
        </div>
    );
}

export function SettingsPage() {
    const [tab, setTab] = useState<string>("general_tab");
    let node: React.ReactNode | null = null;
    switch (tab) {
        case "general_tab":
            node = <GeneralSettingsTab />;
            break;
        default:
            node = <GeneralSettingsTab />;
            break;
    }

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                gap: "20px",
            }}
        >
            <MinecraftRadialButtonPanel
                elements={[{ text: "General", value: "general_tab" }]}
                default_selected_value={"general_tab"}
                onChange={value => {
                    setTab(value);
                }}
            />
            {node}
        </div>
    );
}
