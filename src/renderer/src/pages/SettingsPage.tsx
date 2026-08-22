import { useEffect, useState } from "react";

import { MinecraftRadialButtonPanel } from "@renderer/components/MinecraftRadialButtonPanel";
import { MinecraftToggle } from "@renderer/components/MinecraftToggle";
import { ReadOnlyTextBox } from "@renderer/components/ReadOnlyTextBox";

import { describeError, userMessage } from "@shared/diagnostics/Log";
import { log } from "@renderer/scripts/LauncherLog";
import { useAppStore } from "@renderer/states/AppStore";

const fs = window.require("fs") as typeof import("fs");

export function GeneralSettingsTab() {
    const keepLauncherOpen = useAppStore(state => state.keepLauncherOpen);
    const setKeepLauncherOpen = useAppStore(state => state.setKeepLauncherOpen);
    const developerMode = useAppStore(state => state.developerMode);
    const setDeveloperMode = useAppStore(state => state.setDeveloperMode);
    const lastLaunchedProfileUuid = useAppStore(state => state.lastLaunchedProfileUuid);
    const UITheme = useAppStore(state => state.UITheme);
    const setUITheme = useAppStore(state => state.setUITheme);
    const platform = useAppStore(state => state.platform);
    const paths = platform.getPaths();
    const [launcherCfg, setLauncherCfg] = useState<string>("");

    useEffect(() => {
        let cancelled = false;
        fs.promises.readFile(paths.launcherConfigPath, "utf-8")
            .then(text => { if (!cancelled) setLauncherCfg(text); })
            .catch(e => {
                if (cancelled) return;
                if ((e as { code?: string }).code === "ENOENT") {
                    log("Settings", `No launcher config to show at ${paths.launcherConfigPath}`);
                    setLauncherCfg("No launcher config has been saved yet.");
                    return;
                }
                log("Settings", `Could not read ${paths.launcherConfigPath} for display: ${describeError(e)}`);
                setLauncherCfg(`${paths.launcherConfigPath}\n\nCould not be read: ${userMessage(e)}`);
            });
        return () => { cancelled = true; };
    }, [paths.launcherConfigPath, lastLaunchedProfileUuid, keepLauncherOpen, developerMode, UITheme]);

    return (
        <div className="settings-page settings-scroll-hidden">
            <div className="settings-section">
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

            <div className="popup-divider" />

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

            <div className="minecraft-seven settings-debug">
                <p className="settings-debug-title">Debug Info</p>
                <p>Running Platform: {platform.getPlatformFullName()}</p>
                <p>Amethyst Folder: {paths.amethystPath}</p>
            </div>

            <div className="settings-regular">
                <ReadOnlyTextBox text={launcherCfg} label="Launcher Config" />
            </div>
        </div>
    );
}

export function SettingsPage() {
    return <GeneralSettingsTab />;
}
