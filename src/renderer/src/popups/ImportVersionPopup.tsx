import { Dropdown } from "@renderer/components/Dropdown";
import { MainPanel, MainPanelSection, PanelIndent } from "@renderer/components/MainPanel";
import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { PopupPanel } from "@renderer/components/PopupPanel";
import { TextInput } from "@renderer/components/TextInput";
import { SemVersion } from "@renderer/scripts/classes/SemVersion";
import { PathUtils } from "@renderer/scripts/PathUtils";
import { MinecraftVersionData, MinecraftVersionType } from "@renderer/scripts/VersionDatabase";
import { PopupUseArguments } from "@renderer/states/PopupStore";
import { FileInput } from "lucide-react";

const { ipcRenderer } = window.require("electron") as typeof import("electron");
import { useState, useEffect, useMemo } from "react";

const path = window.require("path") as typeof import("path");
const fs = window.require("fs") as typeof import("fs");
const { v4: uuidv4 } = window.require("uuid") as typeof import("uuid");

export interface ImportVersionPopupData {
    name: string;
    type: MinecraftVersionType;
    version: SemVersion;
    uuid: string;
    file: string;
}

export function ImportVersionPopup({ submit }: PopupUseArguments<ImportVersionPopupData | null>) {
    const [versionName, setVersionName] = useState("");
    const [versionType, setVersionType] = useState("Release");
    const [versionFormat, setVersionFormat] = useState("");
    const [versionFile, setVersionFile] = useState<string | null>(null);
    const [versionUUID] = useState(uuidv4());
    const [targetPath, setTargetPath] = useState("");

    const versionFormatError = useMemo(() => {
        if (versionFormat === "") return ["Version format cannot be empty!"];

        try {
            SemVersion.fromString(versionFormat);
            return null;
        } catch (e) {
            return [
                "Invalid version format!",
                "Version format must be in the form of 'x.x.x' or 'x.x.x.x' where x is a number. Examples: '1.14.60.5', '26.3.1.0', '1.16.201.1'",
                "Where the first three numbers (x.x.x) represent the Minecraft version and the optional fourth number (x) represents the build or revision number.",
            ];
        }
    }, [versionFormat]);

    const isNameValid = useMemo(() => {
        return versionName !== "" && PathUtils.isValidFileName(versionName);
    }, [versionName]);

    const canImport = useMemo(() => {
        return (
            isNameValid &&
            !versionFormatError &&
            versionFile !== null &&
            fs.existsSync(versionFile) &&
            fs.statSync(versionFile).isFile()
        );
    }, [versionName, versionFormatError, versionFile]);

    const isDefaultName = useMemo(() => {
        return versionName === "" || versionName.match(/^Minecraft (\d+\.\d+\.\d+(\.\d+)?)? \((Release|Preview)\)$/);
    }, [versionName]);

    useEffect(() => {
        if (!versionFile) {
            return;
        }

        const fileName = path.basename(versionFile, ".msixvc").toLowerCase();
        const prettifiedVersion = MinecraftVersionData.prettifyVersionNumbers(fileName);
        let finalVersion: string | null = null;
        if (prettifiedVersion) {
            console.log(`Prettified version for file '${fileName}' is '${prettifiedVersion}'`);
            finalVersion = prettifiedVersion;
        } else {
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
        } else if (fileName.match(/microsoft\.minecraftwindowsbeta_/)) {
            setVersionType("Preview");
        }
    }, [versionFile]);

    useEffect(() => {
        if (isDefaultName && versionFormat !== "") {
            setVersionName(`Minecraft ${versionFormat} (${versionType})`);
        }
    }, [versionType]);

    useEffect(() => {
        setTargetPath(
            MinecraftVersionData.buildVersionPath(!!versionFormatError, versionFormat, versionType, versionUUID)
        );
    }, [versionFormat, versionType, versionUUID]);

    return (
        <PopupPanel>
            <div className="app-consent-panel" onClick={e => e.stopPropagation()}>
                <MainPanel>
                    <MainPanelSection>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <p>Import Version</p>
                            <div className="version-popup-close" onClick={() => submit(null)}>
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
                                <TextInput
                                    label="Version Name"
                                    text={versionName}
                                    setText={setVersionName}
                                    style={{
                                        width: "100%",
                                    }}
                                />
                                {!isNameValid && <p style={{ fontSize: "12px", color: "red" }}>Invalid version name</p>}
                            </div>
                            <div className="settings-section" style={{ paddingTop: "2px", paddingBottom: "6px" }}>
                                <Dropdown
                                    id="version-type"
                                    labelText="Version Type"
                                    options={["Release", "Preview"]}
                                    value={versionType}
                                    setValue={setVersionType}
                                />
                            </div>
                            <div className="settings-section" style={{ paddingTop: "2px", paddingBottom: "6px" }}>
                                <TextInput
                                    label="Version"
                                    text={versionFormat}
                                    setText={setVersionFormat}
                                    style={{
                                        width: "100%",
                                    }}
                                />
                                {versionFormatError?.map((error, index) => {
                                    return (
                                        <p style={{ fontSize: "12px", color: "red" }} key={index}>
                                            {error}
                                        </p>
                                    );
                                })}
                            </div>
                            <div className="settings-section" style={{ paddingTop: "2px", paddingBottom: "6px" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                    <p style={{ fontSize: "14px" }}>Version file</p>
                                    <div
                                        className="version-icon-action version-icon-action-neutral"
                                        onClick={async () => {
                                            const result = (await ipcRenderer.invoke("dialog:openFile", [
                                                { name: "MSIXVC Files", extensions: ["msixvc"] },
                                            ])) as string | null;

                                            if (!result) return;

                                            if (!fs.existsSync(result) || !fs.statSync(result).isFile()) {
                                                return;
                                            }

                                            setVersionFile(result);
                                        }}
                                        style={{
                                            display: "flex",
                                            justifyContent: "center",
                                            alignItems: "center",
                                        }}
                                    >
                                        <FileInput size={22} color="white" />
                                    </div>
                                </div>
                                <p style={{ fontSize: "12px", color: versionFile ? "#9f9f9f" : "red" }}>
                                    {versionFile || "No version file selected"}
                                </p>
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
                                    if (!canImport || versionFile === null) return;

                                    submit({
                                        name: versionName,
                                        type: versionType.toLowerCase() as MinecraftVersionType,
                                        version: SemVersion.fromString(versionFormat),
                                        uuid: versionUUID,
                                        file: versionFile,
                                    });
                                }}
                            />
                        </div>
                    </MainPanelSection>
                </MainPanel>
            </div>
        </PopupPanel>
    );
}
