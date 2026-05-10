import { Dropdown } from "@renderer/components/Dropdown";
import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { PopupPanel } from "@renderer/components/PopupPanel";
import { TextInput } from "@renderer/components/TextInput";
import { SemVersion } from "@renderer/scripts/classes/SemVersion";
import { PathUtils } from "@renderer/scripts/PathUtils";
import { MinecraftVersionData, MinecraftVersionType } from "@renderer/scripts/VersionDatabase";
import { PopupUseArguments } from "@renderer/states/PopupStore";

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
};

export function ImportVersionPopup({
    submit
}: PopupUseArguments<ImportVersionPopupData | null>) {
    const [versionName, setVersionName] = useState("");
    const [versionType, setVersionType] = useState("Release");
    const [versionFormat, setVersionFormat] = useState("");
    const [versionFile, setVersionFile] = useState<string | null>(null);
    const [versionUUID] = useState(uuidv4());
    const [targetPath, setTargetPath] = useState("");

    const versionFormatError = useMemo(() => {
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
    }, [versionFormat]);

    const isNameValid = useMemo(() => {
        return versionName !== "" && PathUtils.isValidFileName(versionName);
    }, [versionName]);

    const canImport = useMemo(() => {
        return isNameValid && !versionFormatError && versionFile !== null && fs.existsSync(versionFile) && fs.statSync(versionFile).isFile();
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
        if (isDefaultName && versionFormat !== "") {
            setVersionName(`Minecraft ${versionFormat} (${versionType})`);
        }
    }, [versionType]);

    useEffect(() => {
        setTargetPath(MinecraftVersionData.buildVersionPath(!!versionFormatError, versionFormat, versionType, versionUUID));
    }, [versionFormat, versionType, versionUUID]);

    const pickFile = async () => {
        const result = await ipcRenderer.invoke("dialog:openFile", [
            { name: "MSIXVC Files", extensions: ["msixvc"] }
        ]) as string | null;

        if (!result) return;
        if (!fs.existsSync(result) || !fs.statSync(result).isFile()) return;

        setVersionFile(result);
    };

    return (
        <PopupPanel
            title="Import Version"
            onClose={() => submit(null)}
            size="lg"
            footer={
                <MinecraftButton
                    text="Import!"
                    disabled={!canImport}
                    onClick={() => {
                        if (!canImport || versionFile === null) return;
                        submit({
                            name: versionName,
                            type: versionType.toLowerCase() as MinecraftVersionType,
                            version: SemVersion.fromString(versionFormat),
                            uuid: versionUUID,
                            file: versionFile
                        });
                    }}
                />
            }
        >
            <TextInput label="Version Name" text={versionName} setText={setVersionName} style={{ width: "100%" }} />
            {!isNameValid && <p style={{ fontSize: "12px", color: "red" }}>Invalid version name</p>}

            <Dropdown
                id="version-type"
                labelText="Version Type"
                options={["Release", "Preview"]}
                value={versionType}
                setValue={setVersionType}
            />

            <TextInput label="Version" text={versionFormat} setText={setVersionFormat} style={{ width: "100%" }} />
            {versionFormatError?.map((error, index) => (
                <p style={{ fontSize: "12px", color: "red" }} key={index}>{error}</p>
            ))}

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <p className="minecraft-seven text-input-label">Version file</p>
                    <div
                        className="version-icon-action version-icon-action-neutral"
                        onClick={pickFile}
                        style={{ display: "flex", justifyContent: "center", alignItems: "center" }}
                    >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M12 12v6" /><path d="m15 15-3-3-3 3" /></svg>
                    </div>
                </div>
                <p style={{ fontSize: "12px", color: versionFile ? "#9f9f9f" : "red", wordBreak: "break-all" }}>
                    {versionFile || "No version file selected"}
                </p>
            </div>

            <p style={{ fontSize: "11px", color: "#9f9f9f", wordBreak: "break-all" }}>
                UUID: {versionUUID}
                <br />
                Path: {targetPath}
            </p>
        </PopupPanel>
    );
}
