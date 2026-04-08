import { UpdateInfo } from "electron-updater";
import { useCallback, useEffect, useState } from "react";

import { LoadingWheel } from "@renderer/components/LoadingWheel";
import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { MinecraftButtonStyle } from "@renderer/components/MinecraftButtonStyle";
import { PopupPanel } from "@renderer/components/PopupPanel";
import { useAppStore } from "@renderer/states/AppStore";

const { ipcRenderer } = window.require("electron");

export function UpdatePage() {
    const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
    const [popupClosed, setPopupClosed] = useState<boolean>(false);
    const [downloadActive, setDownloadActive] = useState<boolean>(false);
    const [downloadPercentage, setDownloadPercentage] = useState<number>(0);

    const [appVersion, setAppVersion] = useState("-");

    const checkForUpdates = useCallback(() => {
        ipcRenderer.invoke("check-for-updates");
    }, []);

    const downloadUpdate = useCallback(() => {
        ipcRenderer.invoke("update-download").then(lls => {
            console.log("Download download:", lls);
        });
        setDownloadActive(true);
        ipcRenderer.invoke("set-auto-install-on-app-quit", true);
    }, [setDownloadActive]);

    const ignoreUpdate = useCallback(() => {
        setPopupClosed(true);
        ipcRenderer.invoke("set-auto-install-on-app-quit", false);
    }, [setPopupClosed]);

    useEffect(() => {
        ipcRenderer.invoke("set-auto-download", false);
        ipcRenderer.invoke("set-auto-install-on-app-quit", true);
        if (useAppStore.getState().autoCheckUpdates) checkForUpdates();

        ipcRenderer.on("update-available", (_, info) => {
            console.log("Update available:", info);
            setUpdateInfo(info);
            setUpdateAvailable(true);
            setPopupClosed(false);
        });

        ipcRenderer.on("update-cancelled", (_, info) => {
            console.log("Download cancelled:", info);
            throw new Error(`Launcher Update cancelled`);
        });

        ipcRenderer.on("download-progress", (_, info) => {
            console.log("Download progress:", info);
            setDownloadPercentage(info.percent);
        });

        ipcRenderer.on("update-downloaded", (_, info) => {
            console.log("Update downloaded:", info);
            console.log("restart now?");

            setDownloadPercentage(100);
            setUpdateAvailable(false);
            setPopupClosed(true);
            setDownloadActive(false);
        });
    }, [setUpdateAvailable, setPopupClosed, setDownloadActive, setDownloadPercentage, checkForUpdates]);

    useEffect(() => {
        ipcRenderer.invoke("get-app-version").then(version => {
            setAppVersion(version);
        });
    }, []);

    return (
        <>
            {!popupClosed && updateAvailable && (
                <PopupPanel>
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
                                        style={MinecraftButtonStyle.Confirm}
                                        onClick={downloadUpdate}
                                    />
                                    <MinecraftButton
                                        text="Ignore"
                                        style={MinecraftButtonStyle.Warn}
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
