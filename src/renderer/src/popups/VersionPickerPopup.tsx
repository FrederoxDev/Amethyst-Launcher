import { useEffect, useMemo, useState } from "react";

import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { MinecraftToggle } from "@renderer/components/MinecraftToggle";
import { PopupPanel } from "@renderer/components/PopupPanel";
import { usePopupClose } from "@renderer/components/PopupCloseContext";
import { ImportVersionPopup } from "@renderer/popups/ImportVersionPopup";
import { pickMsixvcFile } from "@renderer/scripts/versions/MsixvcPicker";
import { Channel, channelLabel } from "@renderer/scripts/domain/Channel";
import { CatalogVersion, catalogLabel } from "@renderer/scripts/versions/Catalog";
import { ImportRequest } from "@renderer/scripts/versions/VersionService";
import { describeError, userMessage } from "@shared/diagnostics/Log";
import { log } from "@renderer/scripts/LauncherLog";
import { useAppStore } from "@renderer/states/AppStore";
import { PopupUseArguments } from "@renderer/states/PopupStore";

const { shell } = window.require("electron") as typeof import("electron");

/** A local `.msixvc` the user picked, waiting to be installed. */
export type PendingImport = ImportRequest;

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

export function VersionPickerPopup({ submit: rawSubmit, state, restrictToChannel }: Props) {
    const animateClose = usePopupClose();
    const submit = (result: VersionChoice | null) => animateClose(() => rawSubmit(result));

    const versions = useAppStore(state => state.versions);
    const installedVersions = useAppStore(state => state.installedVersions);

    const [catalog, setCatalog] = useState<readonly CatalogVersion[]>([]);
    const [fetching, setFetching] = useState(true);
    const [importFile, setImportFile] = useState<string | null>(null);
    const [showPreviews, setShowPreviews] = useState(
        () => restrictToChannel === "preview" || localStorage.getItem("version-picker-show-previews") === "true"
    );

    useEffect(() => {
        versions.catalog
            .refresh()
            .then(list => {
                log("VersionPicker", `Version list loaded: ${list.length} entries`);
                setCatalog(list);
            })
            .catch(e => {
                log(
                    "VersionPicker",
                    `Could not load the version list, showing installed versions only: ${describeError(e)}`
                );
                useAppStore
                    .getState()
                    .setError(
                        "The list of downloadable Minecraft versions could not be loaded. Check your internet connection and try again."
                    );
            })
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
            restrictToChannel ? c === restrictToChannel : c === "release" || showPreviews;

        return [...catalog]
            .filter(v => channelAllowed(v.channel))
            .sort(
                (a, b) =>
                    b.version.major - a.version.major ||
                    b.version.minor - a.version.minor ||
                    b.version.patch - a.version.patch ||
                    b.version.build - a.version.build
            );
    }, [catalog, showPreviews, restrictToChannel]);

    const openFilePicker = async () => {
        const picked = await pickMsixvcFile("VersionPicker");
        if (picked) setImportFile(picked);
    };

    if (importFile) {
        return (
            <ImportVersionPopup
                state={state}
                initialFile={importFile}
                defaultChannel={restrictToChannel}
                onBack={() => setImportFile(null)}
                submit={request => {
                    if (!request) {
                        setImportFile(null);
                        return;
                    }
                    submit({
                        versionUuid: request.uuid,
                        channel: request.channel,
                        label: request.label,
                        pendingImport: request,
                    });
                }}
            />
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
                    <MinecraftButton
                        text="Import .msixvc"
                        style={{ "--mc-button-container-w": "140px" }}
                        onClick={openFilePicker}
                    />
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
                            onClick={() =>
                                submit({
                                    versionUuid: v.uuid,
                                    channel: v.channel,
                                    label: v.label,
                                })
                            }
                        >
                            <p className="minecraft-seven">{v.label}</p>
                            <div className="version-picker-item-actions">
                                <span className="minecraft-seven version-picker-item-tag">
                                    {channelLabel(v.channel)}
                                </span>
                                <div
                                    className="version-picker-item-btn"
                                    onClick={e => {
                                        e.stopPropagation();
                                        shell
                                            .openPath(v.path)
                                            .then(error =>
                                                log(
                                                    "VersionPicker",
                                                    error ? `Could not open ${v.path}: ${error}` : `Opened ${v.path}`
                                                )
                                            );
                                    }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                        <path
                                            d="M1 3C1 2.44772 1.44772 2 2 2H6.17157C6.43679 2 6.69114 2.10536 6.87868 2.29289L7.70711 3.12132C7.89464 3.30886 8.149 3.41421 8.41421 3.41421H14C14.5523 3.41421 15 3.86193 15 4.41421V13C15 13.5523 14.5523 14 14 14H2C1.44772 14 1 13.5523 1 13V3Z"
                                            stroke="#FFFFFF"
                                            strokeWidth="1.5"
                                        />
                                    </svg>
                                </div>
                                <div
                                    className="version-picker-item-btn version-picker-item-btn--danger"
                                    onClick={e => {
                                        e.stopPropagation();
                                        versions.uninstall(v.uuid).catch(error => {
                                            log(
                                                "VersionPicker",
                                                `Uninstalling "${v.label}" failed: ${describeError(error)}`
                                            );
                                            useAppStore
                                                .getState()
                                                .setError(`Could not delete ${v.label}: ${userMessage(error)}`);
                                        });
                                    }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                        <path
                                            d="M2 4H14M5.5 4V2.5C5.5 2.22386 5.72386 2 6 2H10C10.2761 2 10.5 2.22386 10.5 2.5V4M6.5 7V11.5M9.5 7V11.5M3.5 4L4.25 13.5C4.25 13.7761 4.47386 14 4.75 14H11.25C11.5261 14 11.75 13.7761 11.75 13.5L12.5 4"
                                            stroke="currentColor"
                                            strokeWidth="1.5"
                                            strokeLinecap="round"
                                        />
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
                          onClick={() =>
                              submit({
                                  versionUuid: v.uuid,
                                  channel: v.channel,
                                  label: catalogLabel(v),
                              })
                          }
                      >
                          <p className="minecraft-seven">{v.version.toString()}</p>
                          <span className="minecraft-seven version-picker-item-tag">{channelLabel(v.channel)}</span>
                      </div>
                  ))}
        </PopupPanel>
    );
}
