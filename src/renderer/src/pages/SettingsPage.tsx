import * as fs from "fs";
import { useEffect, useState } from "react";

import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { MinecraftButtonStyle } from "@renderer/components/MinecraftButtonStyle";
import { MinecraftRadialButtonPanel } from "@renderer/components/MinecraftRadialButtonPanel";
import { MinecraftToggle } from "@renderer/components/MinecraftToggle";
import { ReadOnlyTextBox } from "@renderer/components/ReadOnlyTextBox";

import { AnalyticsConsent, UseAppState } from "@renderer/contexts/AppState";

import { GetPackagePath, HasGdkStableInstalled, UnregisterCurrent, UnregisterGdkStable } from "@renderer/scripts/AppRegistry";
import { SemVersion } from "@renderer/scripts/classes/SemVersion";
import { IsDevModeEnabled } from "@renderer/scripts/DeveloperMode";
import { AmethystFolder, LauncherConfigFile, MinecraftUWPFolder } from "@renderer/scripts/Paths";
import { IsDownloaded, IsRegistered } from "@renderer/scripts/VersionManager";

export function SettingsPage() {
    const keepLauncherOpen = UseAppState(state => state.keepLauncherOpen);
    const setKeepLauncherOpen = UseAppState(state => state.setKeepLauncherOpen);
    const developerMode = UseAppState(state => state.developerMode);
    const setDeveloperMode = UseAppState(state => state.setDeveloperMode);
    const UITheme = UseAppState(state => state.UITheme);
    const setUITheme = UseAppState(state => state.setUITheme);
    const allProfiles = UseAppState(state => state.allProfiles);
    const selectedProfile = UseAppState(state => state.selectedProfile);
    const allMinecraftVersions = UseAppState(state => state.allMinecraftVersions);
    const analyticsConsent = UseAppState(state => state.analyticsConsent);
    const setAnalyticsConsent = UseAppState(state => state.setAnalyticsConsent);
    const [launcherCfg, setLauncherCfg] = useState<string>("");

    const profile = allProfiles[selectedProfile];
    let minecraftVersion: (typeof allMinecraftVersions)[number] | undefined = undefined;
    let isVerDownloaded = false;
    let isRegisteredVerOurs = false;
    let installDir = "";

    const isWindowsDevModeOn = IsDevModeEnabled();

    if (profile) {
        const semVersion = SemVersion.fromString(profile.minecraft_version);
        minecraftVersion = allMinecraftVersions.find(version => version.version.toString() === semVersion.toString());

        if (minecraftVersion) {
            isVerDownloaded = IsDownloaded(minecraftVersion.version);
            isRegisteredVerOurs = IsRegistered(minecraftVersion);
            installDir = GetPackagePath() ?? "Could not find installed.";
        }
    }

    const updateCfgText = () => {
        if (!fs.existsSync(LauncherConfigFile)) {
            setLauncherCfg("Launcher config does not exist...");
            return;
        }

        const data = fs.readFileSync(LauncherConfigFile, "utf-8");
        setLauncherCfg(data);
    };

    useEffect(() => {
        const timer = setTimeout(updateCfgText, 0);
        return () => clearTimeout(timer);
    }, [allProfiles, selectedProfile, keepLauncherOpen, developerMode, UITheme]);

    return (
        <div className="settings-page settings-scroll-hidden">
            <div className="settings-section">
                <div className="settings-row">
                    <div>
                        <p className="minecraft-seven settings-title">{"Analytics Consent"}</p>
                        <p className="minecraft-seven settings-subtitle">
                            {"Send anonymous usage data to help improve the launcher."}
                        </p>
                    </div>
                    <div className="settings-toggle-wrap">
                        <MinecraftToggle
                            isChecked={analyticsConsent === AnalyticsConsent.Accepted}
                            setIsChecked={isChecked => {
                                // Re-give them the option to choose again
                                console.log("Setting analytics consent to unknown");
                                if (!isChecked) {
                                    setAnalyticsConsent(AnalyticsConsent.Declined);
                                    return;
                                }
                                setAnalyticsConsent(AnalyticsConsent.Unknown);
                            }}
                        />
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <div className="settings-row">
                    <div>
                        <p className="minecraft-seven settings-title">{"Keep launcher open"}</p>
                        <p className="minecraft-seven settings-subtitle">
                            {"Prevents the launcher from closing after launching the game."}
                        </p>
                    </div>
                    <div className="settings-toggle-wrap">
                        <MinecraftToggle isChecked={keepLauncherOpen} setIsChecked={setKeepLauncherOpen} />
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <div className="settings-row">
                    <div>
                        <p className="minecraft-seven settings-title">{"Developer mode"}</p>
                        <p className="minecraft-seven settings-subtitle">
                            {"Enables hot-reloading and prompting to attach a debugger."}
                        </p>
                    </div>
                    <div className="settings-toggle-wrap">
                        <MinecraftToggle isChecked={developerMode} setIsChecked={setDeveloperMode} />
                    </div>
                </div>
            </div>

            <div className="settings-section">
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

            <div className="minecraft-seven settings-debug">
                <p className="settings-debug-title">Debug Info</p>
                <p>Minecraft Version: {minecraftVersion ? minecraftVersion.toString() : "No version found."}</p>
                <p>Is version downloaded: {isVerDownloaded ? "true" : "false"}</p>
                <p>Is Registered Version Ours: {isRegisteredVerOurs ? "true" : "false"}</p>
                <p>Is windows developer mode: {isWindowsDevModeOn ? "enabled" : "disabled"}</p>
                <p>Install path: {installDir}</p>
                <p>Amethyst Folder: {AmethystFolder}</p>
                <p>Minecraft Folder: {MinecraftUWPFolder}</p>
            </div>

            <div className="settings-section">
                <ReadOnlyTextBox text={launcherCfg ?? " "} label="Launcher Config" />
            </div>

            <div className="settings-actions">
                <MinecraftButton
                    text="Unregister Currently Installed Version"
                    style={MinecraftButtonStyle.Warn}
                    onClick={async () => {
                        if (HasGdkStableInstalled()) {
                            UnregisterGdkStable();
                            alert("Unregistered GDK Stable Minecraft UWP version.");
                            return;
                        }

                        await UnregisterCurrent();
                        alert("Unregistered currently registered Minecraft UWP version.");
                    }}
                />
            </div>
        </div>
    );
}
