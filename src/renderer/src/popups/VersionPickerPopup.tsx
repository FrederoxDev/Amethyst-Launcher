import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { MinecraftToggle } from "@renderer/components/MinecraftToggle";
import { PopupPanel, usePopupClose } from "@renderer/components/PopupPanel";
import { TextInput } from "@renderer/components/TextInput";
import { SemVersion } from "@renderer/scripts/classes/SemVersion";
import { PathUtils } from "@renderer/scripts/PathUtils";
import { MinecraftVersionData, MinecraftVersionType } from "@renderer/scripts/VersionDatabase";
import { useAppStore } from "@renderer/states/AppStore";
import { PopupUseArguments } from "@renderer/states/PopupStore";
import { useEffect, useMemo, useReducer, useState } from "react";

const { ipcRenderer, shell } = window.require("electron") as typeof import("electron");
const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");
const { v4: uuidv4 } = window.require("uuid") as typeof import("uuid");

export interface VersionImportData {
    name: string;
    version: string;
    type: string;
    uuid: string;
    file: string;
}

export interface VersionPickerResult {
    minecraft_version: string;
    version_uuid: string | null;
    display_name: string;
    importData?: VersionImportData;
}

interface UploadState {
    file: string;
    name: string;
    type: string;
    version: string;
    uuid: string;
}

export function VersionPickerPopup({ submit: rawSubmit }: PopupUseArguments<VersionPickerResult | null>) {
    const animateClose = usePopupClose();
    const submit = (result: VersionPickerResult | null) => animateClose(() => rawSubmit(result));

    const [remoteVersions, setRemoteVersions] = useState<MinecraftVersionData[]>([]);
    const [fetching, setFetching] = useState(true);
    const [updateCount, forceUpdate] = useReducer(x => x + 1, 0);
    const [upload, setUpload] = useState<UploadState | null>(null);
    const [hiddenUuids, setHiddenUuids] = useState<Set<string>>(new Set());

    const versionManager = useAppStore(state => state.versionManager);

    useEffect(() => {
        const fetchVersions = async () => {
            try {
                const versions = await versionManager.database.update();
                if (versions instanceof Error) throw versions;
                setRemoteVersions([...versions]);
            } catch (e) {
                console.error("Failed to fetch versions:", e);
            } finally {
                setFetching(false);
            }
        };
        fetchVersions();

        const unsubInstall = versionManager.subscribe("version_installed", () => forceUpdate());
        const unsubUninstall = versionManager.subscribe("version_uninstalled", () => forceUpdate());
        return () => { unsubInstall(); unsubUninstall(); };
    }, []);

    const installedVersions = useMemo(() => versionManager.getInstalledVersions().filter(v => !hiddenUuids.has(v.uuid)), [versionManager, remoteVersions, hiddenUuids, updateCount]);

    const sortNewestFirst = (a: MinecraftVersionData, b: MinecraftVersionData) => {
        const av = a.version, bv = b.version;
        if (av.major !== bv.major) return bv.major - av.major;
        if (av.minor !== bv.minor) return bv.minor - av.minor;
        return bv.patch - av.patch;
    };

    const [showPreviews, setShowPreviews] = useState(() => localStorage.getItem("version-picker-show-previews") === "true");

    useEffect(() => {
        localStorage.setItem("version-picker-show-previews", String(showPreviews));
    }, [showPreviews]);

    const allVersionsSorted = useMemo(() => {
        return [...remoteVersions].sort(sortNewestFirst);
    }, [remoteVersions]);

    const [previewsVisible, setPreviewsVisible] = useState(false);
    const [previewAnim, setPreviewAnim] = useState<"idle" | "entering" | "exiting">("idle");

    useEffect(() => {
        if (!showPreviews && previewsVisible) {
            setPreviewAnim("exiting");
            const timer = setTimeout(() => {
                setPreviewsVisible(false);
                setPreviewAnim("idle");
            }, 150);
            return () => clearTimeout(timer);
        } else if (showPreviews) {
            setPreviewsVisible(true);
            requestAnimationFrame(() => setPreviewAnim("entering"));
        }
        return undefined;
    }, [showPreviews, previewsVisible]);

    const selectInstalled = (uuid: string) => {
        const installed = installedVersions.find(v => v.uuid === uuid);
        submit({
            minecraft_version: installed?.version.toString() ?? "",
            version_uuid: uuid,
            display_name: installed?.name ?? installed?.version.toString() ?? "",
        });
    };

    const selectRemote = (version: MinecraftVersionData) => {
        submit({
            minecraft_version: version.version.toString(),
            version_uuid: null,
            display_name: version.version.toString(),
        });
    };

    const openFilePicker = async () => {
        const result = await ipcRenderer.invoke("dialog:openFile", [
            { name: "MSIXVC Files", extensions: ["msixvc"] }
        ]) as string | null;

        if (!result || !fs.existsSync(result) || !fs.statSync(result).isFile()) return;

        const fileName = path.basename(result, ".msixvc").toLowerCase();
        const prettifiedVersion = MinecraftVersionData.prettifyVersionNumbers(fileName);

        let detectedVersion = "";
        if (prettifiedVersion) {
            detectedVersion = prettifiedVersion;
        } else {
            const versionMatch = fileName.match(/\d+\.\d+\.\d+\.\d+/);
            if (versionMatch) detectedVersion = versionMatch[0];
        }

        let detectedType = "Release";
        if (fileName.match(/microsoft\.minecraftwindowsbeta_/)) {
            detectedType = "Preview";
        }

        setUpload({
            file: result,
            name: detectedVersion ? `${detectedVersion} (Imported)` : "",
            type: detectedType,
            version: detectedVersion,
            uuid: uuidv4(),
        });
    };

    const canImport = upload !== null
        && upload.name !== ""
        && PathUtils.isValidFileName(upload.name)
        && upload.version !== ""
        && (() => { try { SemVersion.fromString(upload.version); return true; } catch { return false; } })();

    const doImport = () => {
        if (!upload || !canImport) return;

        submit({
            minecraft_version: upload.version,
            version_uuid: upload.uuid,
            display_name: upload.name,
            importData: {
                name: upload.name,
                version: upload.version,
                type: upload.type,
                uuid: upload.uuid,
                file: upload.file,
            },
        });
    };

    // Upload sub-view
    if (upload) {
        return (
            <PopupPanel onExit={() => setUpload(null)}>
                <div className="version-picker import-version-popup" onClick={e => e.stopPropagation()}>
                    <div className="version-picker-header">
                        <p className="minecraft-seven" style={{ fontSize: "16px" }}>Import Version</p>
                        <div className="version-popup-close" onClick={() => setUpload(null)}>
                            <svg width="20" height="20" viewBox="0 0 12 12">
                                <polygon className="fill-[#FFFFFF]" fillRule="evenodd"
                                    points="11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1" />
                            </svg>
                        </div>
                    </div>
                    <div className="version-picker-divider" />
                    <div className="version-picker-import-body">
                        <TextInput
                            label="Version Name"
                            text={upload.name}
                            setText={(v) => setUpload({ ...upload, name: typeof v === "function" ? v(upload.name) : v })}
                            style={{ width: "100%" }}
                        />
                        <TextInput
                            label="Version"
                            text={upload.version}
                            setText={(v) => setUpload({ ...upload, version: typeof v === "function" ? v(upload.version) : v })}
                            style={{ width: "100%" }}
                        />
                        <p className="minecraft-seven" style={{ fontSize: "11px", color: "#9f9f9f", wordBreak: "break-all" }}>
                            File: {upload.file}
                        </p>
                    </div>
                    <div className="version-picker-divider" />
                    <div className="version-picker-footer">
                        <MinecraftButton text="Back" style={{ "--mc-button-container-w": "100px" }} onClick={() => setUpload(null)} />
                        <MinecraftButton text="Continue" disabled={!canImport} style={{ "--mc-button-container-w": "100px" }} onClick={doImport} />
                    </div>
                </div>
            </PopupPanel>
        );
    }

    // Main version picker view
    return (
        <PopupPanel onExit={() => submit(null)}>
            <div className="version-picker" onClick={e => e.stopPropagation()}>
                <div className="version-picker-header">
                    <p className="minecraft-seven" style={{ fontSize: "16px" }}>Select Version</p>
                    <div className="version-popup-close" onClick={() => submit(null)}>
                        <svg width="20" height="20" viewBox="0 0 12 12">
                            <polygon className="fill-[#FFFFFF]" fillRule="evenodd"
                                points="11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1" />
                        </svg>
                    </div>
                </div>
                <div className="version-picker-divider" />
                <div className="version-picker-list scrollbar">
                    {installedVersions.length > 0 && (
                        <>
                            <p className="minecraft-seven version-picker-section-title">Installed</p>
                            {installedVersions.map(v => (
                                <div key={v.uuid} className="version-picker-item" onClick={() => selectInstalled(v.uuid)}>
                                    <p className="minecraft-seven">{v.name}</p>
                                    <div className="version-picker-item-actions">
                                        <span className="minecraft-seven version-picker-item-tag">{v.type === "preview" ? "Preview" : "Stable"}</span>
                                        <div className="version-picker-item-btn" onClick={e => { e.stopPropagation(); shell.openPath(v.path); }}>
                                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                                <path d="M1 3C1 2.44772 1.44772 2 2 2H6.17157C6.43679 2 6.69114 2.10536 6.87868 2.29289L7.70711 3.12132C7.89464 3.30886 8.149 3.41421 8.41421 3.41421H14C14.5523 3.41421 15 3.86193 15 4.41421V13C15 13.5523 14.5523 14 14 14H2C1.44772 14 1 13.5523 1 13V3Z" stroke="#FFFFFF" strokeWidth="1.5" />
                                            </svg>
                                        </div>
                                        <div className="version-picker-item-btn version-picker-item-btn--danger" onClick={e => { e.stopPropagation(); setHiddenUuids(prev => new Set(prev).add(v.uuid)); versionManager.uninstallVersion(v.uuid); }}>
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
                    {fetching ? (
                        Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="version-picker-item version-picker-skeleton">
                                <div className="version-picker-skeleton-text" style={{ width: `${100 + (i % 3) * 30}px` }} />
                                <div className="version-picker-skeleton-tag" />
                            </div>
                        ))
                    ) : (
                        allVersionsSorted.map(v => {
                            const isPreview = v.type === "preview";
                            if (isPreview && !previewsVisible) return null;
                            const animClass = isPreview ? (previewAnim === "entering" ? " preview-enter" : previewAnim === "exiting" ? " preview-exit" : "") : "";
                            return (
                                <div key={v.uuid} className={`version-picker-item${isPreview ? " version-picker-preview-item" : ""}${animClass}`} onClick={() => selectRemote(v)}>
                                    <p className="minecraft-seven">{v.version.toString()}</p>
                                    <span className="minecraft-seven version-picker-item-tag">{isPreview ? "Preview" : "Stable"}</span>
                                </div>
                            );
                        })
                    )}
                </div>
                <div className="version-picker-divider" />
                <div className="version-picker-footer">
                    <div className="version-picker-toggle">
                        <MinecraftToggle isChecked={showPreviews} setIsChecked={setShowPreviews} />
                        <span className="minecraft-seven">Show Previews</span>
                    </div>
                    <MinecraftButton text="Import .msixvc" style={{ "--mc-button-container-w": "140px" }} onClick={openFilePicker} />
                </div>
            </div>
        </PopupPanel>
    );
}
