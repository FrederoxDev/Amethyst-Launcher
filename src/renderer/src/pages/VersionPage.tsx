import { useEffect, useReducer, useState } from "react";
import { useAppStore } from "@renderer/states/AppStore";
import { InstalledVersionModel } from "@renderer/scripts/VersionManager";

import DeleteIconAsset from "@renderer/assets/images/icons/delete-icon.png";
import OpenFolderIconAsset from "@renderer/assets/images/icons/open-folder-icon.png";
import InfoIconAsset from "@renderer/assets/images/icons/info-icon.png";
import { Popup, PopupUseArguments } from "@renderer/states/PopupStore";
import { PopupPanel } from "@renderer/components/PopupPanel";
import { MainPanel, MainPanelSection, PanelIndent } from "@renderer/components/MainPanel";
import { MinecraftButtonStyle } from "@renderer/components/MinecraftButtonStyle";
import { MinecraftButton } from "@renderer/components/MinecraftButton";

const { shell: { openPath } } = window.require("electron") as typeof import("electron");
const path = window.require("path") as typeof import("path");
const { v4: uuidv4 } = window.require("uuid") as typeof import("uuid");
const fs = window.require("fs") as typeof import("fs");
const { ipcRenderer } = window.require("electron") as typeof import("electron");

import "@renderer/styles/pages/SettingsPage.css"
import "@renderer/styles/pages/LauncherPage.css"

import { TextInput } from "@renderer/components/TextInput";
import { Dropdown } from "@renderer/components/Dropdown";
import { SemVersion } from "@renderer/scripts/classes/SemVersion";
import { FileInput, PlusIcon } from "lucide-react";
import { PathUtils } from "@renderer/scripts/PathUtils";
import { MinecraftVersionType } from "@renderer/scripts/VersionDatabase";

// Version prettify copied from https://github.com/LukasPAH/minecraft-windows-gdk-version-db/blob/main/getLatestVersion.ts
const VERSION_REGEX = /(\d+)\.(\d+)\.(\d+)$/;
const CAL_VER_START_NUMBER = 26;
function prettifyVersionNumbers(version: string): string | null {
    version = version.toLowerCase().replace("microsoft.minecraftuwp_", "").replace("microsoft.minecraftwindowsbeta_", "").replace(".0_x64__8wekyb3d8bbwe", "");

    const versionMatch = version.match(VERSION_REGEX);

    if (versionMatch === null) {
        return null;
    }

    const majorVersion = versionMatch[1];
    if (majorVersion === undefined) {
        return null;
    }

    const minorVersion = versionMatch[2];
    if (minorVersion === undefined) {
        return null;
    }

    const patchVersionUnprocessed = versionMatch[3];
    if (patchVersionUnprocessed === undefined) {
        return null;
    }

    const patchVersion = (parseInt(patchVersionUnprocessed) / 100).toFixed(2);

    let versionString = `${majorVersion}.${minorVersion}.${patchVersion}`;
    if (parseInt(minorVersion) >= CAL_VER_START_NUMBER) {
        versionString = `${minorVersion}.${patchVersion}`;
    }

    return versionString;
}

type VersionButtonProps = {
    version: InstalledVersionModel;
    onInspect: (version: InstalledVersionModel) => void;
    onDelete: (version: InstalledVersionModel) => void;
};

interface ImportVersionPopupData {
    versionName: string;
    versionType: MinecraftVersionType;
    versionVersion: SemVersion;
    versionUUID: string;
    versionFile: string;
};

const ImportVersionPopup = ({ submit }: PopupUseArguments<ImportVersionPopupData | null>) => {
    const paths = useAppStore(state => state.platform.getPaths());
    const [versionName, setVersionName] = useState("");
    const [versionType, setVersionType] = useState("Release");
    const [versionFormat, setVersionFormat] = useState("");
    const [versionFile, setVersionFile] = useState<string | null>(null);
    const [versionUUID] = useState(uuidv4());
    
    const getVersionFormatError = () => {
        if (versionFormat === "")
            return ["Version format cannot be empty!"];
        
        try {
            SemVersion.fromString(versionFormat);
            return null;
        }
        catch (e) {
            return [
                "Invalid version format!",
                "Version format must be in the form of 'x.x.x' or 'x.x.x.x' where x is a number. Examples: '1.14.60.5', '26.3.1.0', '1.16.201.1'",
                "Where the first three numbers (x.x.x) represent the Minecraft version and the optional fourth number (x) represents the build or revision number.",
            ];
        }
    }
    
    const [targetPath, setTargetPath] = useState("");
    const isNameValid = versionName !== "" && PathUtils.isValidFileName(versionName);
    const canImport = isNameValid && !getVersionFormatError() && versionFile !== null && fs.existsSync(versionFile) && fs.statSync(versionFile).isFile();

    useEffect(() => {
        if (!versionFile) {
            return;
        }

        const fileName = path.basename(versionFile, ".msixvc").toLowerCase();
        const prettifiedVersion = prettifyVersionNumbers(fileName);
        let finalVersion: string | null = null;
        if (prettifiedVersion) {
            console.log(`Prettified version for file '${fileName}' is '${prettifiedVersion}'`);
            finalVersion = prettifiedVersion;
        }
        else {
            const versionMatch = fileName.match(/\d+\.\d+\.\d+\.\d+/);
            if (versionMatch) {
                finalVersion = versionMatch[0];
            }
        }

        if (finalVersion) {
            setVersionFormat(finalVersion);
        }

        if (fileName.match(/microsoft\.minecraftuwp_/)) {
            setVersionType("Release");
        }
        else if (fileName.match(/microsoft\.minecraftwindowsbeta_/)) {
            setVersionType("Preview");
        }
    }, [versionFile]);

    useEffect(() => {
        const isDefaultName = versionName === "" || versionName.match(/^Minecraft \d+\.\d+\.\d+(\.\d+)? \((Release|Preview)\)$/);
        if (isDefaultName && versionFormat !== "") {
            setVersionName(`Minecraft ${versionFormat} (${versionType})`);
        }
    }, [versionType]);

    useEffect(() => {
        setTargetPath(path.join(paths.versionsPath, `Minecraft-${!getVersionFormatError() ? versionFormat + "-" : "x.x.x.x-"}${versionType.toLowerCase()}-${versionUUID}.msixvc`));
    }, [versionFormat, versionType, versionUUID]);

    return (
        <PopupPanel>
            <div className="app-consent-panel" onClick={e => e.stopPropagation()}>
                <MainPanel>
                    <MainPanelSection>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <p>Import Version</p>
                            <div
                                className="version-popup-close"
                                onClick={() => submit(null)}
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
                        <PanelIndent style={{ gap: "0px" }}>
                            <div className="settings-section" style={{ paddingTop: "2px", paddingBottom: "6px" }}>
                                <TextInput label="Version Name" text={versionName} setText={setVersionName} style={{
                                    width: "100%"
                                }} />
                                {!isNameValid && <p style={{ fontSize: "12px", color: "red" }}>Invalid version name</p>}
                            </div>
                            <div className="settings-section" style={{ paddingTop: "2px", paddingBottom: "6px" }}>
                                <Dropdown
                                    id="version-type"
                                    labelText="Version Type"
                                    options={[
                                        "Release",
                                        "Preview"
                                    ]}
                                    value={versionType}
                                    setValue={setVersionType}
                                />
                            </div>
                            <div className="settings-section" style={{ paddingTop: "2px", paddingBottom: "6px" }}>
                                <TextInput label="Version" text={versionFormat} setText={setVersionFormat} style={{
                                    width: "100%"
                                }} />
                                {
                                    getVersionFormatError()?.map((error, index) => {
                                        return <p style={{ fontSize: "12px", color: "red" }} key={index}>{error}</p>
                                    })
                                }
                            </div>
                            <div className="settings-section" style={{ paddingTop: "2px", paddingBottom: "6px" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                    <p style={{ fontSize: "14px" }}>Version file</p>
                                    <div
                                        className="version-icon-action version-icon-action-neutral"
                                        onClick={async () => {
                                            const result = await ipcRenderer.invoke("dialog:openFile", [
                                                { name: "MSIXVC Files", extensions: ["msixvc"] }
                                            ]) as string | null;

                                            if (!result)
                                                return;

                                            if (!fs.existsSync(result) || !fs.statSync(result).isFile()) {
                                                return;
                                            }

                                            setVersionFile(result);
                                        }}
                                        style={{
                                            display: "flex",
                                            justifyContent: "center",
                                            alignItems: "center"
                                        }}
                                    >
                                        <FileInput size={22} color="white" />
                                    </div>
                                </div>
                                <p style={{ fontSize: "12px", color: versionFile ? "#9f9f9f" : "red" }}>{versionFile || "No version file selected"}</p>
                            </div>
                        </PanelIndent>
                        <p style={{ fontSize: "12px", color: "#9f9f9f" }}>
                            Import information
                            <br />
                            UUID: {versionUUID}
                            <br />
                            Path: {targetPath}
                        </p>
                        <div className="app-consent-actions">
                            <MinecraftButton
                                text="Import!"
                                disabled={!canImport}
                                onClick={async () => {
                                    if (!canImport)
                                        return;

                                    if (fs.existsSync(versionFile)) {
                                        console.log(`Copying version file from ${versionFile} to ${targetPath}`);
                                        await fs.promises.copyFile(versionFile, targetPath);
                                    }

                                    submit({
                                        versionName,
                                        versionType: versionType.toLowerCase() as MinecraftVersionType,
                                        versionVersion: SemVersion.fromString(versionFormat),
                                        versionUUID,
                                        versionFile: targetPath
                                    });
                                }}
                            />
                        </div>
                    </MainPanelSection>
                </MainPanel>
            </div>
        </PopupPanel>
    );
};

const VersionButton = ({ version, onInspect, onDelete }: VersionButtonProps) => {
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

                                versionManager.installVersion({
                                    name: result.versionName,
                                    version: result.versionVersion,
                                    type: result.versionType,
                                    uuid: result.versionUUID,
                                    imported: true,
                                    versionFile: result.versionFile
                                }).then(() => {
                                    console.log("Version installed successfully!");
                                }).catch(e => {
                                    console.error("Failed to install version:", e);
                                });
                            }}
                        >
                            <PlusIcon size={24} color="white" />
                        </div>
                    </div>
                </div>
                <div className="version-page-list scrollbar">
                    {
                        versionManager.getInstalledVersions().map((version, index) => {
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
                                                                        style={MinecraftButtonStyle.Warn}
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
                                            await versionManager.uninstallVersion(version.uuid);
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
