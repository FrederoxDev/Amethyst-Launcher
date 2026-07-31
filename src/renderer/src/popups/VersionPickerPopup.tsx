import { useEffect, useMemo, useState } from "react";

import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { MinecraftToggle } from "@renderer/components/MinecraftToggle";
import { PopupPanel, usePopupClose } from "@renderer/components/PopupPanel";
import { TextInput } from "@renderer/components/TextInput";
import { Dropdown } from "@renderer/components/Dropdown";
import { SemVersion } from "@renderer/scripts/classes/SemVersion";
import { PathUtils } from "@renderer/scripts/PathUtils";
import { Channel, channelLabel, parseChannel } from "@renderer/scripts/domain/Channel";
import { CatalogVersion, catalogLabel, channelFromFilename, prettifyVersionFromFilename } from "@renderer/scripts/versions/Catalog";
import { useAppStore } from "@renderer/states/AppStore";
import { PopupUseArguments } from "@renderer/states/PopupStore";

const { ipcRenderer, shell } = window.require("electron") as typeof import("electron");
const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");

export interface PendingImport {
    label: string;
    version: SemVersion;
    channel: Channel;
    uuid: string;
    file: string;
}

export interface VersionChoice {
    versionUuid: string;
    channel: Channel;
    label: string;
    /** Set when the pick was a local .msixvc that still has to be installed. */
    pendingImport?: PendingImport;
}

interface Props extends PopupUseArguments<VersionChoice | null> {
    /** Limits the list to one channel, e.g. when adopting that channel's existing data. */
    restrictToChannel?: Channel;
}

interface UploadDraft {
    file: string;
    label: string;
    channel: Channel;
    version: string;
    uuid: string;
}

export function VersionPickerPopup({ submit: rawSubmit, restrictToChannel }: Props) {
    const animateClose = usePopupClose();
    const submit = (result: VersionChoice | null) => animateClose(() => rawSubmit(result));

    const versions = useAppStore(state => state.versions);
    const installedVersions = useAppStore(state => state.installedVersions);

    const [catalog, setCatalog] = useState<readonly CatalogVersion[]>([]);
    const [fetching, setFetching] = useState(true);
    const [upload, setUpload] = useState<UploadDraft | null>(null);
    const [showPreviews, setShowPreviews] = useState(
        () => restrictToChannel === "preview" || localStorage.getItem("version-picker-show-previews") === "true"
    );

    useEffect(() => {
        versions.catalog.refresh()
            .then(list => setCatalog(list))
            .catch(e => console.error("[VersionPicker] Could not load the version list:", e))
            .finally(() => setFetching(false));
    }, [versions]);

    useEffect(() => {
        if (!restrictToChannel) localStorage.setItem("version-picker-show-previews", String(showPreviews));
    }, [showPreviews, restrictToChannel]);

    const visibleInstalled = useMemo(
        () => installedVersions.filter(v => !restrictToChannel || v.channel === restrictToChannel),
        [installedVersions, restrictToChannel]
    );

    const visibleCatalog = useMemo(() => {
        const channelAllowed = (c: Channel) =>
            restrictToChannel ? c === restrictToChannel : (c === "release" || showPreviews);

        return [...catalog]
            .filter(v => channelAllowed(v.channel))
            .sort((a, b) =>
                (b.version.major - a.version.major)
                || (b.version.minor - a.version.minor)
                || (b.version.patch - a.version.patch)
                || (b.version.build - a.version.build)
            );
    }, [catalog, showPreviews, restrictToChannel]);

    const openFilePicker = async () => {
        const picked = await ipcRenderer.invoke("dialog:openFile", [
            { name: "MSIXVC Files", extensions: ["msixvc"] },
        ]) as string | null;

        if (!picked) return;
        try {
            if (!fs.statSync(picked).isFile()) return;
        } catch {
            return;
        }

        const fileName = path.basename(picked, ".msixvc");
        const detectedVersion = prettifyVersionFromFilename(fileName)
            ?? fileName.match(/\d+\.\d+\.\d+\.\d+/)?.[0]
            ?? "";

        setUpload({
            file: picked,
            label: detectedVersion ? `${detectedVersion} (Imported)` : "",
            channel: channelFromFilename(fileName) ?? restrictToChannel ?? "release",
            version: detectedVersion,
            uuid: crypto.randomUUID(),
        });
    };

    const versionIsValid = (text: string) => {
        try {
            SemVersion.fromString(text);
            return true;
        } catch {
            return false;
        }
    };

    const canImport = upload !== null
        && upload.label !== ""
        && PathUtils.isValidFileName(upload.label)
        && versionIsValid(upload.version);

    if (upload) {
        return (
            <PopupPanel
                title="Import Version"
                onClose={() => setUpload(null)}
                size="lg"
                footerAlign="between"
                footer={
                    <>
                        <MinecraftButton text="Back" style={{ "--mc-button-container-w": "100px" }} onClick={() => setUpload(null)} />
                        <MinecraftButton
                            text="Continue"
                            disabled={!canImport}
                            style={{ "--mc-button-container-w": "100px" }}
                            onClick={() => submit({
                                versionUuid: upload.uuid,
                                channel: upload.channel,
                                label: upload.label,
                                pendingImport: {
                                    label: upload.label,
                                    version: SemVersion.fromString(upload.version),
                                    channel: upload.channel,
                                    uuid: upload.uuid,
                                    file: upload.file,
                                },
                            })}
                        />
                    </>
                }
            >
                <TextInput
                    label="Version Name"
                    text={upload.label}
                    setText={v => setUpload({ ...upload, label: typeof v === "function" ? v(upload.label) : v })}
                    style={{ width: "100%" }}
                />
                <TextInput
                    label="Version"
                    text={upload.version}
                    setText={v => setUpload({ ...upload, version: typeof v === "function" ? v(upload.version) : v })}
                    style={{ width: "100%" }}
                />
                {!versionIsValid(upload.version) && (
                    <p style={{ fontSize: "12px", color: "red" }}>
                        Version must look like 1.21.60.5 or 26.30.03.
                    </p>
                )}
                <Dropdown
                    id="import-channel"
                    labelText="Channel"
                    options={["Release", "Preview"]}
                    value={channelLabel(upload.channel)}
                    setValue={value => setUpload({ ...upload, channel: parseChannel(value) ?? "release" })}
                />
                <p className="minecraft-seven" style={{ fontSize: "11px", color: "#9f9f9f", wordBreak: "break-all" }}>
                    File: {upload.file}
                </p>
            </PopupPanel>
        );
    }

    return (
        <PopupPanel
            title={restrictToChannel ? `Select ${channelLabel(restrictToChannel)} Version` : "Select Version"}
            onClose={() => submit(null)}
            size="xl"
            bodyClassName="version-picker-list scrollbar"
            footerAlign="between"
            footer={
                <>
                    {!restrictToChannel && (
                        <div className="version-picker-toggle">
                            <MinecraftToggle isChecked={showPreviews} setIsChecked={setShowPreviews} />
                            <span className="minecraft-seven">Show Previews</span>
                        </div>
                    )}
                    <MinecraftButton text="Import .msixvc" style={{ "--mc-button-container-w": "140px" }} onClick={openFilePicker} />
                </>
            }
        >
            {visibleInstalled.length > 0 && (
                <>
                    <p className="minecraft-seven version-picker-section-title">Installed</p>
                    {visibleInstalled.map(v => (
                        <div
                            key={v.uuid}
                            className="version-picker-item"
                            onClick={() => submit({ versionUuid: v.uuid, channel: v.channel, label: v.label })}
                        >
                            <p className="minecraft-seven">{v.label}</p>
                            <div className="version-picker-item-actions">
                                <span className="minecraft-seven version-picker-item-tag">{channelLabel(v.channel)}</span>
                                <div className="version-picker-item-btn" onClick={e => { e.stopPropagation(); shell.openPath(v.path); }}>
                                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                        <path d="M1 3C1 2.44772 1.44772 2 2 2H6.17157C6.43679 2 6.69114 2.10536 6.87868 2.29289L7.70711 3.12132C7.89464 3.30886 8.149 3.41421 8.41421 3.41421H14C14.5523 3.41421 15 3.86193 15 4.41421V13C15 13.5523 14.5523 14 14 14H2C1.44772 14 1 13.5523 1 13V3Z" stroke="#FFFFFF" strokeWidth="1.5" />
                                    </svg>
                                </div>
                                <div
                                    className="version-picker-item-btn version-picker-item-btn--danger"
                                    onClick={e => { e.stopPropagation(); versions.uninstall(v.uuid); }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                        <path d="M2 4H14M5.5 4V2.5C5.5 2.22386 5.72386 2 6 2H10C10.2761 2 10.5 2.22386 10.5 2.5V4M6.5 7V11.5M9.5 7V11.5M3.5 4L4.25 13.5C4.25 13.7761 4.47386 14 4.75 14H11.25C11.5261 14 11.75 13.7761 11.75 13.5L12.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                    </svg>
                                </div>
                            </div>
                        </div>
                    ))}
                </>
            )}

            <p className="minecraft-seven version-picker-section-title">Versions</p>
            {fetching
                ? Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="version-picker-item version-picker-skeleton">
                        <div className="version-picker-skeleton-text" style={{ width: `${100 + (i % 3) * 30}px` }} />
                        <div className="version-picker-skeleton-tag" />
                    </div>
                ))
                : visibleCatalog.map(v => (
                    <div
                        key={v.uuid}
                        className={`version-picker-item${v.channel === "preview" ? " version-picker-preview-item" : ""}`}
                        onClick={() => submit({ versionUuid: v.uuid, channel: v.channel, label: catalogLabel(v) })}
                    >
                        <p className="minecraft-seven">{v.version.toString()}</p>
                        <span className="minecraft-seven version-picker-item-tag">{channelLabel(v.channel)}</span>
                    </div>
                ))}
        </PopupPanel>
    );
}
