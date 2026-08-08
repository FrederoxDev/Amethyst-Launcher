import { useEffect, useMemo, useState } from "react";

import { Dropdown } from "@renderer/components/Dropdown";
import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { PopupPanel } from "@renderer/components/PopupPanel";
import { TextInput } from "@renderer/components/TextInput";
import { describeError } from "@shared/diagnostics/Log";
import { SemVersion } from "@renderer/scripts/classes/SemVersion";
import { log } from "@renderer/scripts/LauncherLog";
import { PathUtils } from "@renderer/scripts/PathUtils";
import { Channel, channelLabel, parseChannel } from "@renderer/scripts/domain/Channel";
import { channelFromFilename, prettifyVersionFromFilename } from "@renderer/scripts/versions/Catalog";
import { ImportRequest } from "@renderer/scripts/versions/VersionService";
import { PopupUseArguments } from "@renderer/states/PopupStore";

const { ipcRenderer } = window.require("electron") as typeof import("electron");
const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");

export function ImportVersionPopup({ submit }: PopupUseArguments<ImportRequest | null>) {
    const [label, setLabel] = useState("");
    const [channel, setChannel] = useState<Channel>("release");
    const [versionText, setVersionText] = useState("");
    const [file, setFile] = useState<string | null>(null);
    const [uuid] = useState(() => crypto.randomUUID());
    const [labelTouched, setLabelTouched] = useState(false);

    const versionError = useMemo(() => {
        if (versionText === "") return "Version cannot be empty.";
        try {
            SemVersion.fromString(versionText);
            return null;
        } catch {
            return "Version must look like 1.21.60.5 or 26.30.03.";
        }
    }, [versionText]);

    const labelValid = label !== "" && PathUtils.isValidFileName(label);
    const canImport = labelValid && !versionError && file !== null;

    useEffect(() => {
        if (!file) return;
        const name = path.basename(file, ".msixvc");

        const detected = prettifyVersionFromFilename(name) ?? name.match(/\d+\.\d+\.\d+\.\d+/)?.[0];
        if (detected) setVersionText(detected);

        const detectedChannel = channelFromFilename(name);
        if (detectedChannel) setChannel(detectedChannel);
    }, [file]);

    useEffect(() => {
        if (labelTouched || versionError) return;
        setLabel(`Minecraft ${versionText} (${channelLabel(channel)})`);
    }, [versionText, channel, labelTouched, versionError]);

    const pickFile = async () => {
        const picked = await ipcRenderer.invoke("dialog:openFile", [
            { name: "MSIXVC Files", extensions: ["msixvc"] },
        ]) as string | null;
        if (!picked) {
            log("ImportVersion", "File picker closed without a .msixvc");
            return;
        }
        try {
            if (fs.statSync(picked).isFile()) {
                log("ImportVersion", `Selected ${picked}`);
                setFile(picked);
            }
            else {
                log("ImportVersion", `Ignoring ${picked}: it is not a file`);
            }
        } catch (e) {
            log("ImportVersion", `Ignoring ${picked}: it could not be read: ${describeError(e)}`);
        }
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
                        if (!canImport || !file) return;
                        submit({ label, channel, version: SemVersion.fromString(versionText), uuid, file });
                    }}
                />
            }
        >
            <TextInput
                label="Version Name"
                text={label}
                setText={value => {
                    setLabelTouched(true);
                    setLabel(typeof value === "function" ? value(label) : value);
                }}
                style={{ width: "100%" }}
            />
            {!labelValid && <p style={{ fontSize: "12px", color: "red" }}>Invalid version name</p>}

            <Dropdown
                id="version-channel"
                labelText="Channel"
                options={["Release", "Preview"]}
                value={channelLabel(channel)}
                setValue={value => setChannel(parseChannel(value) ?? "release")}
            />

            <TextInput label="Version" text={versionText} setText={setVersionText} style={{ width: "100%" }} />
            {versionError && <p style={{ fontSize: "12px", color: "red" }}>{versionError}</p>}

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
                <p style={{ fontSize: "12px", color: file ? "#9f9f9f" : "red", wordBreak: "break-all" }}>
                    {file || "No version file selected"}
                </p>
            </div>
        </PopupPanel>
    );
}
