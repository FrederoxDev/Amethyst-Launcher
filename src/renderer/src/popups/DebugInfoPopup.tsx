import { useEffect, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import vscDarkPlus from "react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus";

import { PopupPanel, usePopupClose } from "@renderer/components/PopupPanel";
import { useAppStore } from "@renderer/states/AppStore";
import { PopupUseArguments } from "@renderer/states/PopupStore";

const { ipcRenderer, shell } = window.require("electron");
const fs = window.require("fs") as typeof import("fs");

export function DebugInfoPopup({ submit: rawSubmit }: PopupUseArguments<void>) {
    const animateClose = usePopupClose();
    const submit = () => animateClose(() => rawSubmit());

    const platform = useAppStore(state => state.platform);
    const paths = platform.getPaths();

    const [appVersion, setAppVersion] = useState("-");
    const [launcherCfg, setLauncherCfg] = useState("");

    useEffect(() => {
        ipcRenderer.invoke("get-app-version").then((v: string) => setAppVersion(v));

        if (fs.existsSync(paths.launcherConfigPath)) {
            setLauncherCfg(fs.readFileSync(paths.launcherConfigPath, "utf-8"));
        } else {
            setLauncherCfg("{}");
        }
    }, []);

    const pathRows: [string, string][] = [
        ["Amethyst Folder", paths.amethystPath],
        ["Launcher Path", paths.launcherPath],
        ["Versions Path", paths.versionsPath],
        ["Installed Versions", paths.installedVersionsFilePath],
        ["Cached Versions", paths.cachedVersionsFilePath],
        ["Profiles File", paths.profilesFilePath],
        ["Mods Path", paths.modsPath],
        ["Launcher Config", paths.launcherConfigPath],
        ["Tools Path", paths.toolsPath],
    ];

    return (
        <PopupPanel onExit={submit}>
            <div className="version-picker debug-info-popup" onClick={e => e.stopPropagation()}>
                <div className="version-picker-header">
                    <p className="minecraft-seven" style={{ fontSize: "16px" }}>
                        Debug Info
                    </p>
                    <div className="version-popup-close" onClick={submit}>
                        <svg width="20" height="20" viewBox="0 0 12 12">
                            <polygon
                                className="fill-[#FFFFFF]"
                                fillRule="evenodd"
                                points="11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1"
                            />
                        </svg>
                    </div>
                </div>
                <div className="version-picker-divider" />
                <div className="version-picker-list scrollbar debug-info-body">
                    <p className="minecraft-seven debug-info-section-title">System</p>
                    <div className="debug-info-rows">
                        <div className="debug-info-row">
                            <span className="debug-info-key">Launcher Version</span>
                            <span className="debug-info-value">{appVersion}</span>
                        </div>
                        <div className="debug-info-row">
                            <span className="debug-info-key">Platform</span>
                            <span className="debug-info-value">{platform.getPlatformFullName()}</span>
                        </div>
                        <div className="debug-info-row">
                            <span className="debug-info-key">Electron</span>
                            <span className="debug-info-value">{process.versions.electron}</span>
                        </div>
                        <div className="debug-info-row">
                            <span className="debug-info-key">Node.js</span>
                            <span className="debug-info-value">{process.versions.node}</span>
                        </div>
                        <div className="debug-info-row">
                            <span className="debug-info-key">Chrome</span>
                            <span className="debug-info-value">{process.versions.chrome}</span>
                        </div>
                    </div>

                    <div className="version-picker-divider" style={{ margin: "12px 0" }} />

                    <p className="minecraft-seven debug-info-section-title">Paths</p>
                    <div className="debug-info-rows">
                        {pathRows.map(([key, value]) => (
                            <div className="debug-info-row debug-info-row--clickable" key={key} onClick={() => shell.openPath(value)}>
                                <span className="debug-info-key">{key}</span>
                                <span className="debug-info-value debug-info-value--path">{value}</span>
                            </div>
                        ))}
                    </div>

                    <div className="version-picker-divider" style={{ margin: "12px 0" }} />

                    <p className="minecraft-seven debug-info-section-title">Launcher Config</p>
                    <SyntaxHighlighter
                        language="json"
                        style={{ ...vscDarkPlus, italic: { fontStyle: "normal" } }}
                        customStyle={{
                            margin: 0,
                            fontSize: "12px",
                            borderRadius: "3px",
                            fontStyle: "normal",
                            overflow: "visible",
                        }}
                        wrapLongLines
                    >
                        {launcherCfg}
                    </SyntaxHighlighter>

                    <p className="minecraft-seven debug-info-secret">thanku freddie &lt;3</p>
                </div>
            </div>
        </PopupPanel>
    );
}

