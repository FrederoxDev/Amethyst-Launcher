import * as child from "child_process";
import * as fs from "fs";
import { useState } from "react";

import { PopupPanel } from "@renderer/components/PopupPanel";

const { ipcRenderer } = window.require("electron");

type VersionButtonProps = {
    version: InstalledVersion;
    onInspect: () => void;
    onDelete: () => void;
};

const VersionButton = ({ version, onInspect, onDelete }: VersionButtonProps) => {
    function DeleteVersion() {
        const message_args = {
            message: "Are you sure you want to delete this version?\n\nThis is an irreversible action!",
            type: "warning",
            buttons: ["Cancel", "Confirm"],
            defaultId: 0,
            title: "Delete Version",
            noLink: true,
        };

        ipcRenderer.invoke("show-message", message_args).then((value: Electron.MessageBoxReturnValue) => {
            if (value.response === 0) return;
            else if (value.response === 1) {
                // REMOVE VERSION
                if (fs.existsSync(version.path)) {
                    fs.rm(version.path, { recursive: true }, err => {
                        if (err) {
                            console.error(err);
                        } else {
                            onDelete();
                            console.warn(`Deleted Version: ${version.version.toString()} at ${version.path}`);
                        }
                    });
                }
            }
        });
    }

    function OpenVersionLocation() {
        if (fs.existsSync(version.path)) {
            child.spawn(`explorer "${version.path}"`, { shell: true });
        }
    }

    function InspectVersion() {
        onInspect();
    }

    return (
        <div className="version-card">
            <div className="version-card-inner">
                <div className="version-card-info">
                    <p className="minecraft-seven version-card-name">{version.version.toString()}</p>
                    {/*<p className="minecraft-seven text-[#B1B2B5] text-[14px] overflow-ellipsis overflow-hidden whitespace-nowrap">{"Path:"} ({version.path})</p>*/}
                </div>
                <div className="version-card-actions">
                    <div
                        className="version-icon-action version-icon-action-delete"
                        onClick={() => DeleteVersion()}
                    >
                        <img src="images/icons/delete-icon.png" alt="" />
                    </div>

                    <div
                        className="version-icon-action version-icon-action-neutral"
                        onClick={() => OpenVersionLocation()}
                    >
                        <img src="images/icons/open-folder-icon.png" alt="" />
                    </div>

                    <div
                        className="version-icon-action version-icon-action-neutral"
                        onClick={() => InspectVersion()}
                    >
                        <img src="images/icons/info-icon.png" alt="" />
                    </div>
                </div>
            </div>
        </div>
    );
};

export function VersionPage() {
    //ValidateVersionsFile();
    //const [versions, SetVersions] = useState<InstalledVersion[]>(GetInstalledVersionsFromFile());
    //console.log(versions);

    const versions = [];

    function RefreshVersions() {
        //ValidateVersionsFile();
        //SetVersions(GetInstalledVersionsFromFile());
    }

    const [selected_version, SetSelectedVersion] = useState<never | undefined>(undefined);

    return (
        <>
            <div className="version-page-root">
                <div className="version-page-panel">
                    <p className="minecraft-seven version-page-title">Version Manager</p>
                    <div className="version-page-list scrollbar">
                        {versions.map((version, index) => {
                            return (
                                <VersionButton
                                    version={version}
                                    onInspect={() => SetSelectedVersion(version)}
                                    onDelete={() => RefreshVersions()}
                                    key={index}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>

            {selected_version && (
                <PopupPanel onExit={() => SetSelectedVersion(undefined)}>
                    <div className="version-popup">
                        <div className="version-popup-header">
                            <p className="minecraft-seven version-popup-title">
                                {selected_version.version.toString()}
                            </p>

                            <div
                                className="version-popup-close"
                                onClick={() => SetSelectedVersion(undefined)}
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
                            <p className="minecraft-seven version-popup-path">{selected_version.path}</p>
                        </div>
                    </div>
                </PopupPanel>
            )}
        </>
    );
}
