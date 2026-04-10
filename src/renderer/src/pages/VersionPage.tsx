import { useEffect, useReducer, useState } from "react";
import { useAppStore } from "@renderer/states/AppStore";
import { InstalledVersionModel } from "@renderer/scripts/VersionManager";

import DeleteIconAsset from "@renderer/assets/images/icons/delete-icon.png";
import OpenFolderIconAsset from "@renderer/assets/images/icons/open-folder-icon.png";
import InfoIconAsset from "@renderer/assets/images/icons/info-icon.png";
import { Popup } from "@renderer/states/PopupStore";
import { PopupPanel } from "@renderer/components/PopupPanel";
import { MainPanel, MainPanelSection, PanelIndent } from "@renderer/components/MainPanel";
import { MinecraftButtonStyle } from "@renderer/components/MinecraftButtonStyle";
import { MinecraftButton } from "@renderer/components/MinecraftButton";

const { shell: { openPath } } = window.require("electron") as typeof import("electron");

import "@renderer/styles/pages/SettingsPage.css"
import "@renderer/styles/pages/LauncherPage.css"

import { ImportVersionPopup, ImportVersionPopupData } from "@renderer/popups/ImportVersionPopup";
import { useDownloadStore } from "@renderer/states/DownloadStore";

type VersionButtonProps = {
    version: InstalledVersionModel;
    onInspect: (version: InstalledVersionModel) => void;
    onDelete: (version: InstalledVersionModel) => void;
};

const VersionButton = ({ 
    version, 
    onInspect, 
    onDelete 
}: VersionButtonProps) => {
    return (
        <div className="version-card">
            <div className="version-card-inner">
                <div className="version-card-info">
                    <p className="minecraft-seven version-card-name">{version.name}</p>
                    <p className="minecraft-seven version-card-path">{version.path}</p>
                </div>
                <div className="version-card-actions">
                    <div
                        className="version-icon-action version-icon-action-delete"
                        onClick={() => onDelete(version)}
                    >
                        <img src={DeleteIconAsset} alt="" />
                    </div>

                    <div
                        className="version-icon-action version-icon-action-neutral"
                        onClick={() => {
                            console.log(`Opening folder for version ${version.version.toString()} at path: ${version.path}`);
                            openPath(version.path);
                        }}
                    >
                        <img src={OpenFolderIconAsset} alt="" />
                    </div>

                    <div
                        className="version-icon-action version-icon-action-neutral"
                        onClick={() => onInspect(version)}
                    >
                        <img src={InfoIconAsset} alt="" />
                    </div>
                </div>
            </div>
        </div>
    );
};

export function VersionPage() {
    const versionManager = useAppStore(state => state.versionManager);
    const [, forceUpdate] = useReducer(x => x + 1, 0);
    const [hiddenUuids, setHiddenUuids] = useState<Set<string>>(new Set());

    useEffect(() => {
        const unsubscribeInstalled = versionManager.subscribe("version_installed", () => {
            forceUpdate();
        });

        const unsubscribeUninstalled = versionManager.subscribe("version_uninstalled", () => {
            forceUpdate();
        });

        return () => {
            unsubscribeInstalled();
            unsubscribeUninstalled();
        };
    }, []);

    return (
        <div className="version-page-root">
            <div className="version-page-panel">
                <div className="version-page-header">
                    <p className="minecraft-seven version-page-title">Version Manager</p>
                    <div className="version-header-actions">
                        <div 
                            className="version-icon-action version-icon-action-neutral"
                            onClick={async () => {
                                const result = await Popup.useAsync<ImportVersionPopupData | null>(props => {
                                    return <ImportVersionPopup {...props} />;
                                });

                                if (!result)
                                    return;

                                const dlId = `version-import-${result.uuid}-${Date.now()}`;
                                const dlStore = useDownloadStore.getState();
                                dlStore.addDownload({
                                    id: dlId,
                                    name: result.name,
                                    type: "version",
                                    progress: 0,
                                    status: "extracting",
                                    abortController: null,
                                });

                                versionManager.installVersion({
                                    kind: "imported",
                                    name: result.name,
                                    version: result.version,
                                    type: result.type,
                                    uuid: result.uuid,
                                    file: result.file
                                }).then(() => {
                                    console.log("Version installed successfully!");
                                    useDownloadStore.getState().updateDownload(dlId, { status: "done", progress: 1 });
                                }).catch(e => {
                                    console.error("Failed to install version:", e);
                                    useDownloadStore.getState().updateDownload(dlId, { status: "error", progress: 0 });
                                });
                            }}
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                        </div>
                    </div>
                </div>
                <div className="version-page-list scrollbar">
                    {
                        versionManager.getInstalledVersions().filter(v => !hiddenUuids.has(v.uuid)).map((version, index) => {
                            return (
                                <VersionButton
                                    version={version}
                                    onInspect={async (version) => {
                                        await Popup.useAsync(({ submit }) => {
                                            console.log(`Inspecting version ${version.version.toString()} at path: ${version.path}`);
                                            return (
                                                <PopupPanel>
                                                    <div className="version-popup">
                                                        <div className="version-popup-header">
                                                            <p className="minecraft-seven version-popup-title">
                                                                {version.version.toString()}
                                                            </p>
                                                            <div
                                                                className="version-popup-close"
                                                                onClick={() => submit()}
                                                            >
                                                                <svg width="12" height="12" viewBox="0 0 12 12">
                                                                    <polygon
                                                                        className="fill-[#FFFFFF]"
                                                                        fillRule="evenodd"
                                                                        points="11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1"
                                                                    />
                                                                </svg>
                                                            </div>
                                                        </div>
                                                        <div className="version-popup-body">
                                                            <p className="minecraft-seven version-popup-path">{version.path}</p>
                                                        </div>
                                                    </div>
                                                </PopupPanel>
                                            );
                                        });
                                    }}
                                    onDelete={async () => {
                                        const result = await Popup.useAsync<boolean>(({ submit }) => {
                                            return (
                                                <PopupPanel onExit={() => submit(false)}>
                                                    <div className="app-consent-panel" onClick={e => e.stopPropagation()}>
                                                        <MainPanel>
                                                            <MainPanelSection>
                                                                <p>Are you sure you want to delete this version?</p>
                                                                <PanelIndent className="app-consent-indent">
                                                                    <p>You are about to delete "{version.name}"!</p>
                                                                    <p>You can download (or import) this version later if you want.</p>
                                                                </PanelIndent>
                                                                <div className="app-consent-actions">
                                                                    <MinecraftButton
                                                                        text="Yeah, do it!"
                                                                        onClick={() => submit(true)}
                                                                        buttonStyle={MinecraftButtonStyle.Warn}
                                                                    />
                                                                    <MinecraftButton
                                                                        text="No, don't do it!"
                                                                        onClick={() => submit(false)}
                                                                    />
                                                                </div>
                                                            </MainPanelSection>
                                                        </MainPanel>
                                                    </div>
                                                </PopupPanel>
                                            );
                                        });
                                        if (result) {
                                            setHiddenUuids(prev => new Set(prev).add(version.uuid));
                                            versionManager.uninstallVersion(version.uuid);
                                        }
                                    }}
                                    key={index}
                                />
                            )
                        })
                    }
                </div>
            </div>
        </div>
    );
}
