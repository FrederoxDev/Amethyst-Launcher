import { UpdateInfo } from "electron-updater";
import { useCallback, useEffect, useState } from "react";

import { LoadingWheel } from "@renderer/components/LoadingWheel";
import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { MinecraftButtonStyle } from "@renderer/components/MinecraftButtonStyle";
import { PopupPanel } from "@renderer/components/PopupPanel";
import { describeError } from "@shared/diagnostics/Log";
import { log } from "@renderer/scripts/LauncherLog";

const { ipcRenderer } = window.require("electron");

export function UpdatePage() {
    const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
    const [popupClosed, setPopupClosed] = useState<boolean>(false);
    const [downloadActive, setDownloadActive] = useState<boolean>(false);
    const [downloadPercentage, setDownloadPercentage] = useState<number>(0);

    const [appVersion, setAppVersion] = useState("-");

    const checkForUpdates = useCallback(() => {
        log("Update", "Asking the main process to check for launcher updates");
        ipcRenderer.invoke("check-for-updates").catch(e => {
            log("Update", `Update check could not be started: ${describeError(e)}`);
        });
    }, []);

    const downloadUpdate = useCallback(() => {
        log("Update", "User chose to download the launcher update");
        ipcRenderer.invoke("update-download")
            .then(files => log("Update", `Update download finished: ${JSON.stringify(files)}`))
            .catch(e => log("Update", `Update download failed: ${describeError(e)}`));
        setDownloadActive(true);
        ipcRenderer.invoke("set-auto-install-on-app-quit", true);
    }, [setDownloadActive]);

    const ignoreUpdate = useCallback(() => {
        log("Update", "User dismissed the launcher update; it will not install on quit");
        setPopupClosed(true);
        ipcRenderer.invoke("set-auto-install-on-app-quit", false);
    }, [setPopupClosed]);

    useEffect(() => {
        ipcRenderer.invoke("set-auto-download", false);
        ipcRenderer.invoke("set-auto-install-on-app-quit", true);
        checkForUpdates();

        const onUpdateAvailable = (_, info) => {
            log("Update", `Update ${info?.version} is available, offering it to the user`);
            setUpdateInfo(info);
            setUpdateAvailable(true);
            setPopupClosed(false);
        };

        const onUpdateCancelled = (_, info) => {
            // Thrown on purpose so the window handler records it as a fatal; log it first,
            // because a throw out of an IPC listener carries no context of its own.
            log("Update", `Update ${info?.version} was cancelled before it finished downloading`);
            throw new Error(`Launcher Update cancelled`);
        };

        // The main process already logs this in 10% steps; the renderer only moves the bar.
        const onDownloadProgress = (_, info) => {
            setDownloadPercentage(info.percent);
        };

        const onUpdateDownloaded = (_, info) => {
            log("Update", `Update ${info?.version} downloaded and ready to install`);

            setDownloadPercentage(100);
            setUpdateAvailable(false);
            setPopupClosed(true);
            setDownloadActive(false);
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
        ipcRenderer.invoke("get-app-version")
            .then(version => setAppVersion(version))
            .catch(e => log("Update", `Could not read the launcher version: ${describeError(e)}`));
    }, []);

    return (
        <>
            {!popupClosed && updateAvailable && (
                <PopupPanel boxStyle={{ width: "fit-content" }}>
                    <div className="update-popup">
                        {!downloadActive && (
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
                            <LoadingWheel text={"Downloading update..."} percentage={downloadPercentage}></LoadingWheel>
                        )}
                    </div>
                </PopupPanel>
            )}
        </>
    );
}
