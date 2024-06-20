import {useAppState} from "../contexts/AppState";
import {useCallback, useEffect, useState} from "react";
import DividedSection from "../components/DividedSection";
import MinecraftButton, {MinecraftButtonStyle} from "../components/MinecraftButton";
import {UpdateInfo} from "electron-updater";
import LoadingWheel from "../components/LoadingWheel";

const {ipcRenderer} = window.require('electron');

export default function UpdatePage() {
    const {autoUpdate, notifyOnUpdate} = useAppState();

    const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
    const [popupClosed, setPopupClosed] = useState<boolean>(false);
    const [downloadActive, setDownloadActive] = useState<boolean>(false);
    const [downloadPercentage, setDownloadPercentage] = useState<number>(0);

    const [appVersion, setAppVersion] = useState('-');

    useEffect(() => {
        ipcRenderer.invoke('set-auto-download', autoUpdate);
        checkForUpdates();

        ipcRenderer.on("update-available", (event, info) => {
            console.log('Update available:', info);
            setUpdateInfo(info);
            setUpdateAvailable(true);
            setPopupClosed(false);
        });

        ipcRenderer.on("update-cancelled", (event, info) => {
            console.log('Download cancelled:', info);
            throw new Error(`Launcher Update cancelled`);
        });

        ipcRenderer.on("download-progress", (event, info) => {
            console.log('Download progress:', info);
            setDownloadPercentage(info.percent);
        });

        ipcRenderer.on("update-downloaded", (event, info) => {
            console.log('Update downloaded:', info);

            setDownloadPercentage(100);
            setUpdateAvailable(false);
            setPopupClosed(true);
            setDownloadActive(false);

            if (!autoUpdate) {
                alert("Update downloaded, restart the launcher to install the update");
            }
        });
    }, [autoUpdate, setUpdateAvailable, setPopupClosed, setDownloadActive, setDownloadPercentage]);

    useEffect(() => {
        ipcRenderer.invoke('get-app-version').then((version) => {
            setAppVersion(version);
        });
    }, []);

    const checkForUpdates = useCallback(() => {
        ipcRenderer.invoke('check-for-updates');
    }, []);

    const downloadUpdate = useCallback(() => {
        ipcRenderer.invoke('update-download').then((lls) => {
            console.log('Download download:', lls);
        });
        setDownloadActive(true);
        ipcRenderer.invoke('set-auto-install-on-app-quit', true);
    }, [setDownloadActive]);

    const ignoreUpdate = useCallback(() => {
        setPopupClosed(true);
        ipcRenderer.invoke('set-auto-install-on-app-quit', false);
    }, [setPopupClosed]);

    return (
        <>{!popupClosed && !autoUpdate && notifyOnUpdate && updateAvailable && (
            <>
                <div className="fixed top-0 left-0 w-full h-full bg-[#000000BB]"></div>
                {!downloadActive && (
                    <div className="fixed top-0 left-0 flex flex-col w-full items-center justify-center h-full">
                        <div>
                            <DividedSection>
                                <p className="minecraft-seven text-white text-[14px]">Launcher Update found!</p>
                            </DividedSection>
                            <DividedSection>
                                <p className="minecraft-seven text-[#BCBEC0] text-[12px]">Version: {updateInfo ? updateInfo.version : "undefined"} (current: {appVersion})</p>
                                <p className="minecraft-seven text-[#BCBEC0] text-[12px]">Path: {updateInfo ? updateInfo.path : "undefined"}</p>
                                <p className="minecraft-seven text-[#BCBEC0] text-[12px]">Release
                                    Date: {updateInfo ? updateInfo.releaseDate : "undefined"}</p>
                                <p className="minecraft-seven text-[#BCBEC0] text-[12px]">Sha512: {updateInfo ? updateInfo.sha512 : "undefined"}</p>
                            </DividedSection>
                            <DividedSection className="flex justify-around gap-[8px]">
                                <div className="w-[50%]"><MinecraftButton text="Download"
                                                                          style={MinecraftButtonStyle.Confirm}
                                                                          onClick={downloadUpdate}/></div>
                                <div className="w-[50%]"><MinecraftButton text="Ignore"
                                                                          style={MinecraftButtonStyle.Warn}
                                                                          onClick={ignoreUpdate}/></div>
                            </DividedSection>
                        </div>
                    </div>
                )}
                {downloadActive && (
                    <LoadingWheel text={"Downloading update..."} percentage={downloadPercentage}></LoadingWheel>
                )}
            </>
        )}
        </>
    );
}
