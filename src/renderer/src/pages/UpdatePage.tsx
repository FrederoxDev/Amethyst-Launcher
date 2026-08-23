import { ProgressInfo, UpdateInfo } from "electron-updater";
import { useCallback, useEffect, useState } from "react";

import { LoadingWheel } from "@renderer/components/LoadingWheel";
import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { MinecraftButtonStyle } from "@renderer/components/MinecraftButtonStyle";
import { PopupPanel } from "@renderer/components/PopupPanel";
import { describeError, userMessage } from "@shared/diagnostics/Log";
import { log } from "@renderer/scripts/LauncherLog";
import { useAppStore } from "@renderer/states/AppStore";

const { ipcRenderer } = window.require("electron") as typeof import("electron");

type IpcEvent = import("electron").IpcRendererEvent;

/** Nothing the update popup asks of the main process is worth failing the render over. */
function tell(channel: string, ...args: unknown[]): void {
    ipcRenderer.invoke(channel, ...args).catch(e => {
        log("Update", `"${channel}" failed: ${describeError(e)}`);
    });
}

interface DownloadOutcome {
    kind: "error" | "info";
    message: string;
}

export function UpdatePage() {
    const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
    const [popupClosed, setPopupClosed] = useState<boolean>(false);
    const [downloadActive, setDownloadActive] = useState<boolean>(false);
    const [downloadPercentage, setDownloadPercentage] = useState<number>(0);
    const [outcome, setOutcome] = useState<DownloadOutcome | null>(null);

    const [appVersion, setAppVersion] = useState("-");

    const checkForUpdates = useCallback(() => {
        log("Update", "Asking the main process to check for launcher updates");
        tell("check-for-updates");
    }, []);

    const downloadUpdate = useCallback(() => {
        log("Update", "User chose to download the launcher update");
        setOutcome(null);
        setDownloadPercentage(0);
        setDownloadActive(true);
        tell("set-auto-install-on-app-quit", true);
        ipcRenderer
            .invoke("update-download")
            .then(files => log("Update", `Update download finished: ${JSON.stringify(files)}`))
            .catch(e => {
                log("Update", `Update download failed: ${describeError(e)}`);
                setDownloadActive(false);
                setOutcome({ kind: "error", message: userMessage(e) });
            });
    }, []);

    const ignoreUpdate = useCallback(() => {
        log("Update", "User dismissed the launcher update; it will not install on quit");
        setPopupClosed(true);
        setDownloadActive(false);
        setOutcome(null);
        tell("set-auto-install-on-app-quit", false);
    }, []);

    useEffect(() => {
        tell("set-auto-download", false);
        tell("set-auto-install-on-app-quit", true);
        // The user can turn the startup check off; updates are then only ever checked on demand.
        if (useAppStore.getState().autoCheckUpdates) checkForUpdates();

        const onUpdateAvailable = (_: IpcEvent, info: UpdateInfo) => {
            log("Update", `Update ${info?.version} is available, offering it to the user`);
            setUpdateInfo(info);
            setUpdateAvailable(true);
            setPopupClosed(false);
            setOutcome(null);
        };

        const onUpdateCancelled = (_: IpcEvent, info: UpdateInfo) => {
            log("Update", `Update ${info?.version} was cancelled before it finished downloading`);
            setDownloadActive(false);
            setOutcome({
                kind: "info",
                message: "The update download was cancelled. The launcher will keep running on this version.",
            });
        };

        // The main process already logs this in 10% steps; the renderer only moves the bar.
        const onDownloadProgress = (_: IpcEvent, info: ProgressInfo) => {
            setDownloadPercentage(info.percent);
        };

        const onUpdateDownloaded = (_: IpcEvent, info: UpdateInfo) => {
            log("Update", `Update ${info?.version} downloaded and ready to install`);

            setDownloadPercentage(100);
            setUpdateAvailable(false);
            setPopupClosed(true);
            setDownloadActive(false);
            setOutcome(null);
        };

        ipcRenderer.on("update-available", onUpdateAvailable);
        ipcRenderer.on("update-cancelled", onUpdateCancelled);
        ipcRenderer.on("download-progress", onDownloadProgress);
        ipcRenderer.on("update-downloaded", onUpdateDownloaded);

        return () => {
            ipcRenderer.removeListener("update-available", onUpdateAvailable);
            ipcRenderer.removeListener("update-cancelled", onUpdateCancelled);
            ipcRenderer.removeListener("download-progress", onDownloadProgress);
            ipcRenderer.removeListener("update-downloaded", onUpdateDownloaded);
        };
    }, [setUpdateAvailable, setPopupClosed, setDownloadActive, setDownloadPercentage, checkForUpdates]);

    useEffect(() => {
        ipcRenderer
            .invoke("get-app-version")
            .then(version => setAppVersion(version))
            .catch(e => log("Update", `Could not read the launcher version: ${describeError(e)}`));
    }, []);

    return (
        <>
            {!popupClosed && updateAvailable && (
                <PopupPanel boxStyle={{ width: "fit-content" }}>
                    <div className="update-popup">
                        {!downloadActive && !outcome && (
                            <div className="update-popup-body">
                                <div className="update-popup-section">
                                    <p className="minecraft-seven update-popup-heading">Launcher Update found!</p>
                                </div>
                                <div className="update-popup-section">
                                    <p className="minecraft-seven update-popup-meta">
                                        Version: {updateInfo ? updateInfo.version : "undefined"} (current: {appVersion})
                                    </p>
                                    <p className="minecraft-seven update-popup-meta">
                                        Path: {updateInfo ? updateInfo.path : "undefined"}
                                    </p>
                                    <p className="minecraft-seven update-popup-meta">
                                        Release Date: {updateInfo ? updateInfo.releaseDate : "undefined"}
                                    </p>
                                    <p className="minecraft-seven update-popup-meta">
                                        Sha512: {updateInfo ? updateInfo.sha512 : "undefined"}
                                    </p>
                                </div>
                                <div className="update-popup-actions">
                                    <MinecraftButton
                                        text="Download"
                                        buttonStyle={MinecraftButtonStyle.Confirm}
                                        onClick={downloadUpdate}
                                    />
                                    <MinecraftButton
                                        text="Ignore"
                                        buttonStyle={MinecraftButtonStyle.Warn}
                                        onClick={ignoreUpdate}
                                    />
                                </div>
                            </div>
                        )}
                        {downloadActive && (
                            <div className="update-popup-body">
                                <LoadingWheel
                                    text={"Downloading update..."}
                                    percentage={downloadPercentage}
                                ></LoadingWheel>
                                <div className="update-popup-actions">
                                    <MinecraftButton
                                        text="Hide"
                                        buttonStyle={MinecraftButtonStyle.Warn}
                                        onClick={() => setPopupClosed(true)}
                                    />
                                </div>
                            </div>
                        )}
                        {!downloadActive && outcome && (
                            <div className="update-popup-body">
                                <div className="update-popup-section">
                                    <p className="minecraft-seven update-popup-heading">
                                        {outcome.kind === "error" ? "Update download failed" : "Update cancelled"}
                                    </p>
                                    <p className="minecraft-seven update-popup-meta">{outcome.message}</p>
                                </div>
                                <div className="update-popup-actions">
                                    {outcome.kind === "error" && (
                                        <MinecraftButton
                                            text="Try Again"
                                            buttonStyle={MinecraftButtonStyle.Confirm}
                                            onClick={downloadUpdate}
                                        />
                                    )}
                                    <MinecraftButton
                                        text="Close"
                                        buttonStyle={MinecraftButtonStyle.Warn}
                                        onClick={ignoreUpdate}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </PopupPanel>
            )}
        </>
    );
}
