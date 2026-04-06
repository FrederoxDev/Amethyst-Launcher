import { logEvent } from "firebase/analytics";
import { doc, increment, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";

import { MainPanelSection, PanelIndent } from "@renderer/components/MainPanel";
import { MinecraftButton, RED_MINECRAFT_BUTTON } from "@renderer/components/MinecraftButton";
import { MinecraftRadialButtonPanel } from "@renderer/components/MinecraftRadialButtonPanel";
import { PopupPanel, usePopupClose } from "@renderer/components/PopupPanel";
import { NewInstancePopup } from "@renderer/popups/NewInstancePopup";
import { VersionPickerPopup } from "@renderer/popups/VersionPickerPopup";
import { runCreateProfileWizard } from "@renderer/scripts/ProfileWizard";
import { downloadToTemp, importModZip, uninstallMod } from "@renderer/scripts/backend/ModDownloader";
import { GetProfileModsPath } from "@renderer/scripts/Profiles";
import { db } from "@renderer/firebase/Firebase";
import { useAppStore } from "@renderer/states/AppStore";
import { useDownloadStore, addPendingDownload, removePendingDownload } from "@renderer/states/DownloadStore";
import { Popup } from "@renderer/states/PopupStore";

import { ModDiscoveryData, GithubRelease, ParsedGithubRelease } from "./ModDiscoveryTypes";
import { useCachedIcon, releasesCache } from "./ModCard";
import { ModReadme } from "./ModReadme";

const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");
const { shell } = window.require("electron");

export function parseGitHubRepo(githubUrl: string) {
    const match = githubUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) return null;
    return { owner: match[1], repo: match[2] };
}

export function ModDownloads({ mod, onClose }: { mod: ModDiscoveryData; onClose?: () => void }) {
    const cached = releasesCache.get(mod.githubUrl);
    const [releases, setReleases] = useState<ParsedGithubRelease[]>(cached ?? []);
    const [loading, setLoading] = useState(!cached);
    const analyticsInstance = useAppStore(state => state.analyticsInstance);
    const allMods = useAppStore(state => state.allMods);
    const refreshAllMods = useAppStore(state => state.refreshAllMods);
    const downloadingMods = useAppStore(state => state.downloadingMods);
    const trustAllMods = useAppStore(state => state.trustAllMods);

    useEffect(() => {
        if (releasesCache.has(mod.githubUrl)) return;

        const repo = parseGitHubRepo(mod.githubUrl);
        if (!repo) return;

        const fetchReleases = async () => {
            try {
                const response = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/releases`);
                const data: GithubRelease[] = await response.json();

                const parsedData: ParsedGithubRelease[] = [];

                for (const release of data) {
                    const asset = release.assets.find(asset => asset.name.includes("@") && asset.name.endsWith(".zip"));
                    if (!asset) continue;

                    parsedData.push({
                        id: release.id,
                        name: release.name,
                        published_at: release.published_at,
                        download_name: asset.name.replace(".zip", ""),
                        download_url: asset.browser_download_url,
                    });
                }

                releasesCache.set(mod.githubUrl, parsedData);
                setReleases(parsedData);
            } catch (err) {
                console.error("Error fetching releases", err);
            } finally {
                setLoading(false);
            }
        };

        fetchReleases();
    }, [mod.githubUrl]);

    const handleInstallClick = async (release: ParsedGithubRelease, isTrusted: boolean) => {
        if (isTrusted || trustAllMods) {
            await installMod(release);
            onClose?.();
            return;
        }

        const confirmed = await Popup.useAsync<boolean>(({ submit }) => (
            <PopupPanel onExit={() => submit(false)} onConfirm={() => submit(true)}>
                <div className="version-picker mod-confirm-popup" onClick={e => e.stopPropagation()}>
                    <div className="version-picker-header">
                        <p className="minecraft-seven mod-confirm-title">Install Community Mod</p>
                        <div className="version-popup-close" onClick={() => submit(false)}>
                            <svg width="20" height="20" viewBox="0 0 12 12">
                                <polygon
                                    className="fill-[#FFFFFF]"
                                    fillRule="evenodd"
                                    points="11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1"
                                />
                            </svg>
                        </div>
                    </div>

                    <div className="version-picker-divider" />

                    <div className="mod-confirm-body">
                        <p className="minecraft-seven mod-confirm-description">
                            {release.download_name} is not officially published or reviewed by the Amethyst team.
                        </p>

                        <div className="mod-confirm-items">
                            {[
                                "Code has not been reviewed for security issues",
                                "May cause instability or unexpected behaviour",
                                "Only install if you trust the source",
                            ].map(item => (
                                <div key={item} className="mod-confirm-item">
                                    <span className="mod-confirm-dot" />
                                    <p className="minecraft-seven">{item}</p>
                                </div>
                            ))}
                        </div>

                        <p className="minecraft-seven mod-confirm-note">
                            To skip this warning for all community mods, enable Trust all community mods in Settings.
                        </p>
                    </div>

                    <div className="version-picker-divider" />

                    <div className="version-picker-footer">
                        <div style={{ flex: 1 }}>
                            <MinecraftButton
                                text="Cancel"
                                onClick={() => submit(false)}
                                colorPallete={RED_MINECRAFT_BUTTON}
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <MinecraftButton text="Install Anyway" onClick={() => submit(true)} />
                        </div>
                    </div>
                </div>
            </PopupPanel>
        ));

        if (confirmed) {
            await installMod(release);
            onClose?.();
        }
    };

    const installMod = async (release: ParsedGithubRelease) => {
        const installingFor = useAppStore.getState().installingForProfile;
        let targetProfileUuid: string;

        if (installingFor !== null) {
            targetProfileUuid = installingFor;
        } else {
            const profileIndex = await Popup.useAsync<number | null>(({ submit }) => {
                const profiles = useAppStore.getState().allProfiles;
                return (
                    <PopupPanel onExit={() => submit(null)}>
                        <div className="version-picker" style={{ height: "47vh" }} onClick={e => e.stopPropagation()}>
                            <div className="version-picker-header">
                                <p className="minecraft-seven" style={{ fontSize: "16px" }}>
                                    Add to Profile
                                </p>
                                <div className="version-popup-close" onClick={() => submit(null)}>
                                    <svg width="20" height="20" viewBox="0 0 12 12">
                                        <polygon
                                            className="fill-[#FFFFFF]"
                                            fillRule="evenodd"
                                            points="11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1"
                                        />
                                    </svg>
                                </div>
                            </div>
                            <div className="version-picker-divider" />
                            <div className="version-picker-list scrollbar" style={{ flex: 1 }}>
                                {profiles.length === 0 && (
                                    <p
                                        className="minecraft-seven"
                                        style={{ color: "#9f9f9f", padding: "12px", textAlign: "center" }}
                                    >
                                        No profiles yet. Create one below.
                                    </p>
                                )}
                                {profiles.map((profile, index) => (
                                    <div
                                        key={profile.uuid}
                                        className="version-picker-item"
                                        onClick={() => submit(index)}
                                    >
                                        <p className="minecraft-seven">{profile.name}</p>
                                        <span className="minecraft-seven version-picker-item-tag">
                                            {fs.existsSync(path.join(GetProfileModsPath(profile.uuid), release.download_name)) ? "Has mod" : profile.runtime}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <div className="version-picker-divider" />
                            <div className="version-picker-footer">
                                <MinecraftButton
                                    text="New Profile"
                                    style={{ "--mc-button-container-w": "140px" }}
                                    onClick={() => submit(-1)}
                                />
                            </div>
                        </div>
                    </PopupPanel>
                );
            });

            if (profileIndex === null) return;

            if (profileIndex === -1) {
                const newProfile = await runCreateProfileWizard();
                if (!newProfile) return;
                targetProfileUuid = newProfile.uuid;
            } else {
                const pickedProfile = useAppStore.getState().allProfiles[profileIndex];
                if (!pickedProfile) return;
                targetProfileUuid = pickedProfile.uuid;
            }
        }

        const state = useAppStore.getState();
        const targetIndex = state.allProfiles.findIndex(p => p.uuid === targetProfileUuid);
        if (targetIndex !== -1) state.setSelectedProfile(targetIndex);
        state.setDownloadingMods([...state.downloadingMods, release.download_name]);
        state.saveData();

        const dlId = `mod-${release.download_name}-${Date.now()}`;
        const abortController = new AbortController();
        const dlStore = useDownloadStore.getState();
        dlStore.addDownload({
            id: dlId,
            name: release.download_name,
            type: "mod",
            progress: 0,
            status: "downloading",
            abortController,
        });

        addPendingDownload({
            id: dlId,
            name: release.download_name,
            type: "mod",
            url: release.download_url,
            profileUuid: targetProfileUuid,
        });

        downloadToTemp(
            release.download_url,
            release.download_name + ".zip",
            (transferred, total) => {
                useDownloadStore.getState().updateDownload(dlId, {
                    progress: total > 0 ? transferred / total : 0,
                });
            },
            abortController.signal
        ).then(async ({ ok, path: filePath, error }) => {
            if (!ok) {
                console.error(error);
                useAppStore.getState().setDownloadingMods(prev => prev.filter(n => n !== release.download_name));
                useDownloadStore.getState().updateDownload(dlId, { status: "error", progress: 0 });
                removePendingDownload(dlId);
                return;
            }

            useDownloadStore.getState().updateDownload(dlId, { status: "extracting", progress: 1 });
            await importModZip(filePath!, targetProfileUuid);
            refreshAllMods();
            useAppStore.getState().setDownloadingMods(prev => prev.filter(n => n !== release.download_name));
            useDownloadStore.getState().updateDownload(dlId, { status: "done" });
            removePendingDownload(dlId);

            console.log(`Incrementing download count for mod ${mod.id}`);
            const modDocRef = doc(db, "mods", mod.id);
            await updateDoc(modDocRef, { downloads: increment(1) });

            if (analyticsInstance) {
                logEvent(analyticsInstance, "mod_install", { mod_name: release.download_name });
            }
        });
    };

    return (
        <PanelIndent>
            <div className="mod-release-container">
            {loading &&
                Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="version-picker-item mod-downloads-skeleton-item">
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <div className="mod-card-skeleton-text" style={{ width: "180px", height: "13px" }} />
                            <div className="mod-card-skeleton-text" style={{ width: "90px", height: "11px" }} />
                        </div>
                    </div>
                ))
            }
            {!loading && releases.length === 0 && (
                <p className="minecraft-seven mod-release-empty">No releases found.</p>
            )}
            {!loading &&
                releases.map(release => {
                    const isInstalled = allMods.find(m => m.id === release.download_name) !== undefined;
                    const isInstalling = downloadingMods.includes(release.download_name);
                    return (
                        <div key={release.id} className="version-picker-item">
                            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                                <p className="minecraft-seven" style={{ color: "white", fontSize: "13px" }}>
                                    {release.download_name}
                                </p>
                                <p className="minecraft-seven" style={{ color: "#9f9f9f", fontSize: "11px" }}>
                                    {new Date(release.published_at).toLocaleDateString()}
                                </p>
                            </div>
                            <div className="version-picker-item-actions">
                                {!isInstalled && (
                                    <div
                                        className="version-picker-item-btn"
                                        style={
                                            isInstalling ? { display: "flex", opacity: 0.5, cursor: "wait" } : undefined
                                        }
                                        onClick={e => {
                                            e.stopPropagation();
                                            if (isInstalling) return;
                                            handleInstallClick(release, mod.isAmethystOrgMod ?? false);
                                        }}
                                    >
                                        <svg
                                            width="14"
                                            height="14"
                                            viewBox="0 0 16 16"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="1.5"
                                            strokeLinecap="round"
                                        >
                                            <path d="M8 2v8M4.5 7.5L8 11l3.5-3.5M2 14h12" />
                                        </svg>
                                    </div>
                                )}
                                {isInstalled && (
                                    <>
                                        <div
                                            className="version-picker-item-btn"
                                            style={{ display: "flex" }}
                                            title="Add to profile"
                                            onClick={async e => {
                                                e.stopPropagation();
                                                const installingFor = useAppStore.getState().installingForProfile;
                                                if (installingFor !== null) {
                                                    onClose?.();
                                                } else {
                                                    await handleInstallClick(release, mod.isAmethystOrgMod ?? false);
                                                }
                                            }}
                                        >
                                            <svg
                                                width="14"
                                                height="14"
                                                viewBox="0 0 16 16"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                            >
                                                <path d="M8 3v10M3 8h10" />
                                            </svg>
                                        </div>
                                        <div
                                            className="version-picker-item-btn version-picker-item-btn--danger"
                                            style={{ display: "flex" }}
                                            onClick={e => {
                                                e.stopPropagation();
                                                const selectedProfile = useAppStore.getState().allProfiles[useAppStore.getState().selectedProfile];
                                                if (selectedProfile) uninstallMod(release.download_name, selectedProfile.uuid);
                                                refreshAllMods();
                                                if (analyticsInstance) {
                                                    logEvent(analyticsInstance, "mod_uninstall", {
                                                        mod_name: release.download_name,
                                                    });
                                                }
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
                                    </>
                                )}
                                <span className="minecraft-seven version-picker-item-tag">
                                    {isInstalled ? "Installed" : ""}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </PanelIndent>
    );
}

export function ModDetails({ mod, onClose }: { mod: ModDiscoveryData; onClose?: () => void }) {
    const [openTab, setOpenTab] = useState<string>("README");
    const iconSrc = useCachedIcon(mod.iconUrl);

    return (
        <MainPanelSection>
            <div className="mod-details-header">
                <img src={iconSrc} alt={`${mod.name} icon`} className="mod-details-icon" />

                <div className="mod-card-body">
                    <h3 className="minecraft-seven mod-card-title">{mod.name}</h3>
                    <p className="minecraft-seven mod-card-description">{mod.description}</p>
                    <p className="minecraft-seven mod-card-authors">By: {mod.authors.join(", ")}</p>
                </div>

                <div className="mod-card-side">
                    <p className="minecraft-seven mod-card-installs">Installs: {mod.downloads}</p>
                    <a
                        href={mod.githubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="minecraft-seven mod-details-link"
                        onClick={e => {
                            e.preventDefault();
                            shell.openExternal(mod.githubUrl);
                        }}
                    >
                        Open In Github
                    </a>
                </div>
            </div>

            <MinecraftRadialButtonPanel
                elements={[
                    { text: "Description", value: "README" },
                    { text: "Versions", value: "Versions" },
                ]}
                default_selected_value={openTab}
                onChange={value => {
                    setOpenTab(value);
                }}
            />
            {openTab === "README" && <ModReadme githubUrl={mod.githubUrl} />}
            {openTab === "Versions" && <ModDownloads mod={mod} onClose={onClose} />}
        </MainPanelSection>
    );
}

export function ModDetailsPopup({ mod, onClose }: { mod: ModDiscoveryData; onClose: () => void }) {
    const animateClose = usePopupClose();
    const close = () => animateClose(onClose);

    return (
        <PopupPanel onExit={close}>
            <div className="version-picker mod-details-popup" onClick={e => e.stopPropagation()}>
                <ModDetails mod={mod} onClose={close} />
            </div>
        </PopupPanel>
    );
}
