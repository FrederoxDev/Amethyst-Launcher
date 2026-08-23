import { useCallback, useEffect, useState } from "react";

import { Markdown } from "@renderer/components/Markdown";
import { MainPanelSection, PanelIndent } from "@renderer/components/MainPanel";
import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { MinecraftButtonStyle } from "@renderer/components/MinecraftButtonStyle";
import { MinecraftRadialButtonPanel } from "@renderer/components/MinecraftRadialButtonPanel";
import { PopupPanel } from "@renderer/components/PopupPanel";
import { usePopupClose } from "@renderer/components/PopupCloseContext";

import { fetchReadme, invalidateReadmes } from "@renderer/scripts/discovery/GithubReadme";
import {
    cachedReleases,
    fetchReleases,
    invalidateReleases,
    ModRelease,
} from "@renderer/scripts/discovery/GithubReleases";
import { cachedIcon, clearIconCache, loadIcon, subscribeIconCache } from "@renderer/scripts/discovery/IconCache";
import {
    catalogSnapshot,
    DiscoveredMod,
    fetchCatalog,
    invalidateCatalog,
} from "@renderer/scripts/discovery/ModCatalog";
import { createProfileFlow } from "@renderer/flows/CreateProfile";
import { attachInstalledMod, installDiscoveredMod, uninstallMod } from "@renderer/flows/InstallDiscoveredMod";
import { log } from "@renderer/scripts/LauncherLog";

import { useAppStore } from "@renderer/states/AppStore";
import { Popup } from "@renderer/states/PopupStore";

import { describeError, userMessage } from "@shared/diagnostics/Log";

const { shell } = window.require("electron") as typeof import("electron");

function useCachedIcon(url: string): string {
    const [generation, setGeneration] = useState(0);

    useEffect(() => subscribeIconCache(() => setGeneration(g => g + 1)), []);

    useEffect(() => {
        if (cachedIcon(url)) return;

        let cancelled = false;
        loadIcon(url)
            .then(() => {
                if (!cancelled) setGeneration(g => g + 1);
            })
            .catch(e => log("ModDiscovery", `Could not cache the image ${url}: ${describeError(e)}`));

        return () => {
            cancelled = true;
        };
    }, [url, generation]);

    return cachedIcon(url) ?? url;
}

type SortMode = "downloads" | "date";

function ModCard({ mod, onOpenDetails }: { mod: DiscoveredMod; onOpenDetails: () => void }) {
    const bannerSrc = useCachedIcon(mod.bannerUrl ?? mod.iconUrl);
    const [imgError, setImgError] = useState(false);
    return (
        <div className="mod-card" onClick={onOpenDetails}>
            {imgError ? (
                <div className="mod-card-icon mod-card-icon-placeholder" />
            ) : (
                <img
                    src={bannerSrc}
                    alt={`${mod.name} banner`}
                    className="mod-card-icon"
                    onError={() => setImgError(true)}
                />
            )}
            <div className="mod-card-body">
                <h3 className="minecraft-seven mod-card-title">{mod.name}</h3>
                <p className="minecraft-seven mod-card-authors">{mod.authors.join(", ")}</p>
                <p className="minecraft-seven mod-card-description">{mod.description}</p>
            </div>
            <div className="mod-card-footer">
                <div className="mod-card-installs">
                    <svg
                        width="12"
                        height="12"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="#a0a0a0"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M8 2v8M4.5 7.5L8 11l3.5-3.5M2 14h12" />
                    </svg>
                    <span className="minecraft-seven">{mod.downloads}</span>
                </div>
            </div>
        </div>
    );
}

function ModReadme({ githubUrl }: { githubUrl: string }) {
    const [readme, setReadme] = useState("Loading...");

    useEffect(() => {
        let cancelled = false;
        fetchReadme(githubUrl).then(text => {
            if (!cancelled) setReadme(text);
        });
        return () => {
            cancelled = true;
        };
    }, [githubUrl]);

    return (
        <PanelIndent>
            <div className="mod-readme-container">
                <Markdown assetBaseUrl={githubUrl}>{readme}</Markdown>
            </div>
        </PanelIndent>
    );
}

type ProfileChoice = { kind: "profile"; uuid: string } | { kind: "new" };

function pickProfile(modName: string): Promise<ProfileChoice | null> {
    return Popup.ask<ProfileChoice | null>(({ submit }) => {
        const profiles = useAppStore.getState().profiles;
        return (
            <PopupPanel
                title="Add to Profile"
                onClose={() => submit(null)}
                size="md"
                bodyClassName="version-picker-list scrollbar"
                footer={
                    <MinecraftButton
                        text="New Profile"
                        style={{ "--mc-button-container-w": "140px" }}
                        onClick={() => submit({ kind: "new" })}
                    />
                }
            >
                {profiles.length === 0 && (
                    <p className="minecraft-seven mod-picker-empty">No profiles yet. Create one below.</p>
                )}
                {profiles.map(profile => (
                    <div
                        key={profile.uuid}
                        className="version-picker-item"
                        onClick={() => submit({ kind: "profile", uuid: profile.uuid })}
                    >
                        <p className="minecraft-seven">{profile.name}</p>
                        <span className="minecraft-seven version-picker-item-tag">
                            {profile.mods.includes(modName) ? "Has mod" : profile.modded ? "Modded" : "Vanilla"}
                        </span>
                    </div>
                ))}
            </PopupPanel>
        );
    });
}

/** The profile a mod should be attached to, or null if the user backed out. */
async function chooseTargetProfile(modName: string): Promise<string | null> {
    const state = useAppStore.getState();
    const installingFor = state.installingForProfile;

    if (installingFor !== null) {
        const profile = state.profiles.find(p => p.uuid === installingFor);
        if (profile) {
            log(
                "ModDiscovery",
                `Adding "${modName}" to "${profile.name}" (${profile.uuid}), the profile it was opened from`
            );
            return profile.uuid;
        }
        log("ModDiscovery", `The profile "${modName}" was opened from is gone; asking which profile to use instead`);
    }

    const choice = await pickProfile(modName);
    if (!choice) {
        log("ModDiscovery", `"${modName}" cancelled at the profile picker`);
        return null;
    }

    if (choice.kind === "new") {
        const created = await createProfileFlow();
        if (!created) {
            log("ModDiscovery", `"${modName}" cancelled while creating a profile for it`);
            return null;
        }
        return created.profile.uuid;
    }

    return choice.uuid;
}

function ModDownloads({ mod, onClose }: { mod: DiscoveredMod; onClose?: () => void }) {
    const [releases, setReleases] = useState<ModRelease[]>(() => cachedReleases(mod.githubUrl) ?? []);
    const [loading, setLoading] = useState(cachedReleases(mod.githubUrl) === undefined);
    const [failure, setFailure] = useState("");
    const allMods = useAppStore(state => state.allMods);
    const refreshAllMods = useAppStore(state => state.refreshAllMods);
    const downloadingMods = useAppStore(state => state.downloadingMods);
    const [confirmingMod, setConfirmingMod] = useState<ModRelease | null>(null);

    useEffect(() => {
        if (cachedReleases(mod.githubUrl)) return;

        let cancelled = false;
        fetchReleases(mod.githubUrl)
            .then(fetched => {
                if (!cancelled) setReleases(fetched);
            })
            .catch(e => {
                if (!cancelled) setFailure(userMessage(e));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [mod.githubUrl]);

    const startInstall = async (release: ModRelease) => {
        const profileUuid = await chooseTargetProfile(release.downloadName);
        if (profileUuid === null) return;

        onClose?.();
        installDiscoveredMod({ modId: mod.id, release, profileUuid }).catch(e => {
            log("ModDiscovery", `Installing "${release.downloadName}" failed: ${describeError(e)}`);
            useAppStore.getState().setError(`Could not install ${release.downloadName}: ${userMessage(e)}`);
        });
    };

    const handleInstallClick = (release: ModRelease) => {
        if (mod.isAmethystOrgMod) {
            log("ModDiscovery", `Installing "${release.downloadName}" directly: "${mod.name}" is an Amethyst org mod`);
            startInstall(release);
            return;
        }
        log("ModDiscovery", `Asking the user to confirm the unreviewed mod "${release.downloadName}"`);
        setConfirmingMod(release);
    };

    const addToProfile = async (release: ModRelease) => {
        const profileUuid = await chooseTargetProfile(release.downloadName);
        if (profileUuid === null) return;
        attachInstalledMod(profileUuid, release.downloadName);
        onClose?.();
    };

    const removeMod = async (release: ModRelease) => {
        try {
            await uninstallMod(release.downloadName);
        } catch (e) {
            useAppStore.getState().setError(userMessage(e));
        }
        refreshAllMods();
    };

    return (
        <PanelIndent>
            {confirmingMod && (
                <PopupPanel
                    title={confirmingMod.downloadName}
                    onClose={() => setConfirmingMod(null)}
                    size="md"
                    footerAlign="between"
                    footer={
                        <>
                            <MinecraftButton
                                text="Cancel"
                                onClick={() => setConfirmingMod(null)}
                                buttonStyle={MinecraftButtonStyle.Warn}
                                style={{ flex: 1, minWidth: 0 }}
                            />
                            <MinecraftButton
                                text="Continue"
                                onClick={() => {
                                    startInstall(confirmingMod);
                                    setConfirmingMod(null);
                                }}
                                style={{ flex: 1, minWidth: 0 }}
                            />
                        </>
                    }
                >
                    <p className="minecraft-seven mod-confirm-text">
                        This mod is not officially published or reviewed by the Amethyst team. The code has not been
                        checked for security or stability issues, and may behave unexpectedly. Only install if you trust
                        the source.
                    </p>
                </PopupPanel>
            )}

            {loading && <p className="minecraft-seven mod-release-empty">Loading releases...</p>}
            {!loading && failure !== "" && <p className="minecraft-seven mod-release-empty">{failure}</p>}
            {!loading && failure === "" && releases.length === 0 && (
                <p className="minecraft-seven mod-release-empty">No releases found.</p>
            )}
            {!loading &&
                failure === "" &&
                releases.map(release => {
                    const isInstalled = allMods.find(m => m.id === release.downloadName) !== undefined;
                    const isInstalling = downloadingMods.includes(release.downloadName);
                    return (
                        <div key={release.id} className="version-picker-item">
                            <div className="mod-release-info">
                                <p className="minecraft-seven mod-release-name">{release.downloadName}</p>
                                <p className="minecraft-seven mod-release-date">
                                    {new Date(release.publishedAt).toLocaleDateString()}
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
                                            handleInstallClick(release);
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
                                            onClick={e => {
                                                e.stopPropagation();
                                                addToProfile(release);
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
                                                removeMod(release);
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
        </PanelIndent>
    );
}

function ModDetails({ mod, onClose }: { mod: DiscoveredMod; onClose?: () => void }) {
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
            {openTab === "README" && <ModReadme key={mod.githubUrl} githubUrl={mod.githubUrl} />}
            {openTab === "Versions" && <ModDownloads key={mod.githubUrl} mod={mod} onClose={onClose} />}
        </MainPanelSection>
    );
}

function ModDetailsPopup({ mod, onClose }: { mod: DiscoveredMod; onClose: () => void }) {
    const animateClose = usePopupClose();
    const close = () => animateClose(onClose);

    return (
        <PopupPanel onClose={close} boxClassName="mod-details-popup" bodyClassName="popup-body--flush">
            <ModDetails mod={mod} onClose={close} />
        </PopupPanel>
    );
}

export function ModDiscovery() {
    const [searchText, setSearchText] = useState("");
    const [mods, setMods] = useState<DiscoveredMod[]>(() => catalogSnapshot() ?? []);
    const [selectedMod, setSelectedMod] = useState<DiscoveredMod | null>(null);
    const [fetching, setFetching] = useState(catalogSnapshot() === null);
    const [sortMode, setSortMode] = useState<SortMode>("downloads");

    const loadCatalog = useCallback(async () => {
        setFetching(true);
        try {
            setMods(await fetchCatalog());
        } catch (e) {
            log("ModDiscovery", `Could not load the mod list: ${describeError(e)}`);
            useAppStore
                .getState()
                .setError(
                    `The mod list could not be loaded: ${userMessage(e)} Check your internet connection and try again.`
                );
        } finally {
            setFetching(false);
        }
    }, []);

    useEffect(() => {
        if (catalogSnapshot()) return;
        loadCatalog();
    }, [loadCatalog]);

    const refresh = () => {
        log("ModDiscovery", "Refreshing the mod list, releases, READMEs and cached images");
        invalidateCatalog();
        invalidateReleases();
        invalidateReadmes();
        clearIconCache();
        setSelectedMod(null);
        loadCatalog();
    };

    const filteredMods = mods
        .filter(mod => mod.name.toLowerCase().includes(searchText.toLowerCase()) && !mod.hidden)
        .sort((a, b) => {
            if (sortMode === "date") return (b.createdAt ?? 0) - (a.createdAt ?? 0);
            return b.downloads - a.downloads;
        });

    return (
        <div className="mod-discovery-page">
            <div className="mod-grid scrollbar">
                <div className="mod-grid-search">
                    <div className="mod-search-row">
                        <div className="mod-search-box">
                            <svg
                                className="mod-search-icon"
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#6f6f6f"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <input
                                type="text"
                                className="minecraft-seven mod-search-input"
                                spellCheck={false}
                                placeholder="Search mods..."
                                value={searchText}
                                onInput={e => setSearchText(e.currentTarget.value)}
                            />
                        </div>
                        <select
                            className="minecraft-seven mod-sort-select"
                            value={sortMode}
                            onChange={e => setSortMode(e.target.value as SortMode)}
                        >
                            <option value="downloads">Downloads</option>
                            <option value="date">Newest</option>
                        </select>
                        <div
                            className="mod-refresh-button"
                            title="Refresh"
                            onClick={() => {
                                if (!fetching) refresh();
                            }}
                        >
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />
                            </svg>
                        </div>
                    </div>
                </div>
                {fetching
                    ? Array.from({ length: 8 }).map((_, i) => (
                          <div key={i} className="mod-card mod-card-skeleton">
                              <div className="mod-card-skeleton-icon" />
                              <div className="mod-card-body">
                                  <div
                                      className="mod-card-skeleton-text"
                                      style={{ width: `${60 + (i % 3) * 20}%`, height: "16px" }}
                                  />
                                  <div
                                      className="mod-card-skeleton-text"
                                      style={{ width: `${40 + (i % 2) * 30}%`, height: "13px" }}
                                  />
                              </div>
                              <div className="mod-card-footer">
                                  <div className="mod-card-skeleton-text" style={{ width: "60%", height: "12px" }} />
                                  <div className="mod-card-skeleton-text" style={{ width: "40%", height: "12px" }} />
                              </div>
                          </div>
                      ))
                    : filteredMods.map(mod => (
                          <ModCard key={mod.id} mod={mod} onOpenDetails={() => setSelectedMod(mod)} />
                      ))}
            </div>

            <div className="launcher-footer">
                <div className="launcher-disclaimer">
                    <p className="minecraft-seven launcher-disclaimer-text">
                        Not approved by or associated with Mojang or Microsoft
                    </p>
                </div>
            </div>

            {selectedMod && <ModDetailsPopup mod={selectedMod} onClose={() => setSelectedMod(null)} />}
        </div>
    );
}
