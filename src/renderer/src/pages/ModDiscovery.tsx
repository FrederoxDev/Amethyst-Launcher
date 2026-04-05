import { logEvent } from "firebase/analytics";
import { collection, doc, getDocs, increment, updateDoc } from "firebase/firestore";
const fs = window.require("fs") as typeof import("fs");
const os = window.require("os") as typeof import("os");
import React, { useEffect, useState } from "react";
import { Dropdown } from "@renderer/components/Dropdown";
import ReactMarkdown from "react-markdown";
import { ModVideoPlayer } from "@renderer/components/ModVideoPlayer";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import vscDarkPlus from "react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus";

import { MainPanelSection, PanelIndent } from "@renderer/components/MainPanel";
import { MinecraftButton, RED_MINECRAFT_BUTTON } from "@renderer/components/MinecraftButton";
import { MinecraftRadialButtonPanel } from "@renderer/components/MinecraftRadialButtonPanel";
import { PopupPanel, usePopupClose } from "@renderer/components/PopupPanel";

import { NewInstancePopup, NewInstanceResult } from "@renderer/popups/NewInstancePopup";
import { VersionPickerPopup, VersionPickerResult } from "@renderer/popups/VersionPickerPopup";

import { Profile } from "@renderer/scripts/Profiles";
import { useAppStore } from "@renderer/states/AppStore";
import { Popup } from "@renderer/states/PopupStore";

import { db } from "@renderer/firebase/Firebase";
import { useDownloadStore, addPendingDownload, removePendingDownload } from "@renderer/states/DownloadStore";

import { Extractor } from "@renderer/scripts/backend/Extractor";

const { shell } = window.require("electron");
const path = window.require("path");

const iconCache = new Map<string, string>();
const readmeCache = new Map<string, string>();
const releasesCache = new Map<string, ParsedGithubRelease[]>();
let modsCache: ModDiscoveryData[] | null = null;

function useCachedIcon(url: string): string {
    const [src, setSrc] = useState(() => iconCache.get(url) ?? url);

    useEffect(() => {
        if (iconCache.has(url)) {
            setSrc(iconCache.get(url)!);
            return;
        }

        let revoked = false;
        fetch(url)
            .then(res => res.blob())
            .then(blob => {
                if (revoked) return;
                const blobUrl = URL.createObjectURL(blob);
                iconCache.set(url, blobUrl);
                setSrc(blobUrl);
            })
            .catch(() => {});

        return () => {
            revoked = true;
        };
    }, [url]);

    return src;
}

function getPaths() {
    return useAppStore.getState().platform.getPaths();
}

interface ModDiscoveryData {
    id: string;
    iconUrl: string;
    bannerUrl?: string;
    name: string;
    description: string;
    authors: string[];
    downloads: number;
    githubUrl: string;
    createdAt?: number;

    // Used to hide mods from the discovery page without deleting them
    hidden?: boolean;

    // Used exclusively for Amethyst org mods, no exceptions will be made to this
    isAmethystOrgMod?: boolean;
}

type SortMode = "downloads" | "date";

function ModCard({ mod, onOpenDetails }: { mod: ModDiscoveryData; onOpenDetails: () => void }) {
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

function resolveGithubAsset(src: string, githubUrl: string): string {
    if (src.startsWith("http://") || src.startsWith("https://")) return src;
    const rawBase =
        githubUrl.replace("https://github.com/", "https://raw.githubusercontent.com/").replace(/\/$/, "") + "/main/";
    return rawBase + src.replace(/^\.\//, "");
}

export function ModReadme({ githubUrl }: { githubUrl: string }) {
    const [readme, setReadme] = useState<string>(() => readmeCache.get(githubUrl) ?? "Loading...");

    useEffect(() => {
        if (readmeCache.has(githubUrl)) return;

        const fetchReadme = async () => {
            try {
                const rawUrl =
                    githubUrl.replace("https://github.com/", "https://raw.githubusercontent.com/").replace(/\/$/, "") +
                    "/main/README.md";

                const response = await fetch(rawUrl);
                if (!response.ok) throw new Error("README not found");
                const text = await response.text();
                readmeCache.set(githubUrl, text);
                setReadme(text);
            } catch (e) {
                const fallback = "README could not be loaded.";
                readmeCache.set(githubUrl, fallback);
                setReadme(fallback);
            }
        };

        fetchReadme();
    }, [githubUrl]);

    return (
        <PanelIndent>
            <div className="mod-readme-container">
                <ReactMarkdown
                    components={{
                        h1: ({ node, ...props }) => <h1 className="minecraft-seven mod-md-h1" {...props} />,
                        h2: ({ node, ...props }) => <h2 className="minecraft-seven mod-md-h2" {...props} />,
                        h3: ({ node, ...props }) => <h3 className="minecraft-seven mod-md-h3" {...props} />,
                        h4: ({ node, ...props }) => <h4 className="minecraft-seven mod-md-h4" {...props} />,
                        h5: ({ node, ...props }) => <h5 className="minecraft-seven mod-md-h5" {...props} />,
                        p: ({ node, ...props }) => <p className="minecraft-seven mod-md-p" {...props} />,
                        li: ({ node, ...props }) => <li className="minecraft-seven mod-md-li" {...props} />,
                        ol: ({ node, ...props }) => <ol className="mod-md-ol" {...props} />,
                        ul: ({ node, ...props }) => <ul className="mod-md-ul" {...props} />,
                        code: ({ node, ...props }) => <code className="minecraft-seven mod-md-code" {...props} />,
                        pre: ({ children }) => {
                            type CodeProps = { className?: string; children?: React.ReactNode };
                            const codeEl = (
                                Array.isArray(children) ? children[0] : children
                            ) as React.ReactElement<CodeProps>;
                            const lang = /language-(\w+)/.exec(codeEl?.props?.className ?? "")?.[1];
                            if (lang) {
                                return (
                                    <SyntaxHighlighter
                                        language={lang}
                                        style={{ ...vscDarkPlus, italic: { fontStyle: "normal" } }}
                                        customStyle={{
                                            margin: "8px 0",
                                            fontSize: "13px",
                                            borderRadius: "4px",
                                            fontStyle: "normal",
                                        }}
                                    >
                                        {String(codeEl.props.children ?? "").replace(/\n$/, "")}
                                    </SyntaxHighlighter>
                                );
                            }
                            return <pre className="mod-md-pre">{children}</pre>;
                        },
                        blockquote: ({ node, ...props }) => <blockquote className="mod-md-blockquote" {...props} />,
                        table: ({ node, ...props }) => <table className="minecraft-seven mod-md-table" {...props} />,
                        thead: ({ node, ...props }) => <thead className="mod-md-thead" {...props} />,
                        tr: ({ node, ...props }) => <tr className="mod-md-tr" {...props} />,
                        th: ({ node, ...props }) => <th className="minecraft-seven mod-md-th" {...props} />,
                        td: ({ node, ...props }) => <td className="minecraft-seven mod-md-td" {...props} />,
                        img: ({ src, alt, ...props }) => {
                            if (src)
                                return (
                                    <img
                                        className="mod-md-img"
                                        draggable
                                        {...props}
                                        src={resolveGithubAsset(src, githubUrl)}
                                        alt={alt}
                                    />
                                );
                            return null;
                        },
                        video: props => <ModVideoPlayer {...props} />,
                        source: ({ src, type }: { src?: string; type?: string }) => (
                            <source type={type} src={src ? resolveGithubAsset(src, githubUrl) : undefined} />
                        ),
                        hr: ({ ...props }) => <hr className="mod-md-hr" {...props} />,
                        strong: ({ ...props }) => <strong className="minecraft-seven mod-md-strong" {...props} />,
                        em: ({ ...props }) => <em className="minecraft-seven mod-md-em" {...props} />,
                        del: ({ ...props }) => <del className="minecraft-seven mod-md-del" {...props} />,
                        a: ({ node, ...props }) => (
                            <a
                                {...props}
                                className="minecraft-seven mod-md-link"
                                onClick={e => {
                                    e.preventDefault();
                                    if (props.href) {
                                        shell.openExternal(props.href);
                                    }
                                }}
                            />
                        ),
                    }}
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                >
                    {readme}
                </ReactMarkdown>
            </div>
        </PanelIndent>
    );
}

interface GithubRelease {
    id: number;
    name: string;
    tag_name: string;
    html_url: string;
    published_at: string;
    assets: {
        id: number;
        name: string;
        browser_download_url: string;
    }[];
}

function parseGitHubRepo(githubUrl: string) {
    const match = githubUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) return null;
    return { owner: match[1], repo: match[2] };
}

interface ParsedGithubRelease {
    name: string;
    id: number;
    published_at: string;

    download_name: string;
    download_url: string;
}

async function downloadToTemp(
    url: string,
    filename: string,
    onProgress?: (transferred: number, total: number) => void,
    signal?: AbortSignal
): Promise<{ ok: boolean; path?: string; error?: string }> {
    try {
        const res = await fetch(url, { signal });
        if (!res.ok) return { ok: false, error: `Failed to download: ${res.statusText}` };

        const total = parseInt(res.headers.get("Content-Length") || "0", 10);
        const reader = res.body?.getReader();
        if (!reader) return { ok: false, error: "No response body" };

        const chunks: Uint8Array[] = [];
        let transferred = 0;
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                transferred += value.length;
                onProgress?.(transferred, total);
            }
        } finally {
            reader.releaseLock();
        }

        // Combine chunks and write to disk in one shot
        const combined = new Uint8Array(transferred);
        let offset = 0;
        for (const chunk of chunks) {
            combined.set(chunk, offset);
            offset += chunk.length;
        }

        const tempDir = os.tmpdir();
        const filePath = path.join(tempDir, filename);
        fs.writeFileSync(filePath, combined);

        console.log(`Downloaded to ${filePath}`);
        return { ok: true, path: filePath };
    } catch (e: any) {
        if (e.name === "AbortError") return { ok: false, error: "Download cancelled" };
        return { ok: false, error: e.message ?? String(e) };
    }
}

async function ImportZIP(zip_path: string): Promise<void> {
    try {
        const paths = getPaths();
        const zip_name = path.basename(zip_path);
        const extracted_folder_path = path.join(paths.modsPath, zip_name.slice(0, -".zip".length));
        console.log("Extracting", zip_path, "to", extracted_folder_path);
        await Extractor.extractFile(zip_path, extracted_folder_path, [], undefined, success => {
            if (!success) {
                console.error("Extractor reported failure for:", zip_path);
            } else {
                console.log("Successfully extracted Mod ZIP!");
            }
        });
    } catch (error) {
        console.error("ImportZIP failed:", error);
    }
}

function uninstallMod(modName: string): void {
    const paths = getPaths();
    const modPath = path.join(paths.modsPath, modName);
    if (fs.existsSync(modPath)) {
        fs.rmSync(modPath, { recursive: true, force: true });
        console.log(`Uninstalled mod: ${modName}`);
    } else {
        console.log(`Mod not found: ${modName}`);
    }
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
        let targetProfileIndex: number;

        if (installingFor !== null) {
            // Came from a profile's "Add Content" — skip profile picker
            targetProfileIndex = installingFor;
        } else {
            // Ask which profile to add the mod to
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
                                            {profile.mods.includes(release.download_name) ? "Has mod" : profile.runtime}
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

            // Handle "New Profile" — run full creation flow
            targetProfileIndex = profileIndex;
            if (profileIndex === -1) {
                let versionResult = await Popup.useAsync<VersionPickerResult | null>(props => {
                    return <VersionPickerPopup {...props} />;
                });
                if (!versionResult) return;

                while (true) {
                    const instanceResult = await Popup.useAsync<NewInstanceResult | null>(props => {
                        return <NewInstancePopup {...props} versionLabel={versionResult!.display_name} />;
                    });
                    if (!instanceResult) return;

                    if (instanceResult.kind === "reselect") {
                        const newVersion = await Popup.useAsync<VersionPickerResult | null>(props => {
                            return <VersionPickerPopup {...props} />;
                        });
                        if (!newVersion) return;
                        versionResult = newVersion;
                        continue;
                    }

                    const isModded = instanceResult.runtime === "modded";
                    const state = useAppStore.getState();
                    const newProfile: Profile = {
                        uuid: crypto.randomUUID(),
                        name: instanceResult.name,
                        is_modded: isModded,
                        minecraft_version: versionResult.minecraft_version,
                        version_uuid: versionResult.version_uuid,
                        mods: [],
                        runtime: "Vanilla",
                    };
                    const newProfiles = [...state.allProfiles, newProfile];
                    state.setAllProfiles(newProfiles);
                    state.setSelectedProfile(newProfiles.length - 1);
                    state.saveData();
                    targetProfileIndex = newProfiles.length - 1;
                    break;
                }
            }
        }

        // Add mod to profile, download in background, stay on page
        const state = useAppStore.getState();
        const profile = state.allProfiles[targetProfileIndex];
        if (profile && !profile.mods.includes(release.download_name)) {
            const updatedProfiles = state.allProfiles.map((p, i) =>
                i === targetProfileIndex ? { ...p, mods: [...p.mods, release.download_name] } : p
            );
            state.setAllProfiles(updatedProfiles);
        }
        state.setSelectedProfile(targetProfileIndex);
        state.setDownloadingMods([...state.downloadingMods, release.download_name]);
        state.saveData();

        // Download and install in background
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

        // Persist for crash recovery
        addPendingDownload({
            id: dlId,
            name: release.download_name,
            type: "mod",
            url: release.download_url,
            profileIndex: targetProfileIndex,
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
        ).then(async ({ ok, path, error }) => {
            if (!ok) {
                console.error(error);
                useAppStore.getState().setDownloadingMods(prev => prev.filter(n => n !== release.download_name));
                useDownloadStore.getState().updateDownload(dlId, { status: "error", progress: 0 });
                removePendingDownload(dlId);
                return;
            }

            useDownloadStore.getState().updateDownload(dlId, { status: "extracting", progress: 1 });
            await ImportZIP(path!);
            refreshAllMods();
            useAppStore.getState().setDownloadingMods(prev => prev.filter(n => n !== release.download_name));
            useDownloadStore.getState().updateDownload(dlId, { status: "done" });
            removePendingDownload(dlId);

            // update download count in firestore
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
            {loading && <p className="minecraft-seven mod-release-empty">Loading releases...</p>}
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
                                                    // Add directly to the profile we came from
                                                    const state = useAppStore.getState();
                                                    const profile = state.allProfiles[installingFor];
                                                    if (profile && !profile.mods.includes(release.download_name)) {
                                                        const updatedProfiles = state.allProfiles.map((p, i) =>
                                                            i === installingFor
                                                                ? { ...p, mods: [...p.mods, release.download_name] }
                                                                : p
                                                        );
                                                        state.setAllProfiles(updatedProfiles);
                                                        state.saveData();
                                                    }
                                                    onClose?.();
                                                } else {
                                                    // No profile context — use same picker flow as install
                                                    // handleInstallClick awaits installMod and calls onClose itself
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
                                                uninstallMod(release.download_name);
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
        </PanelIndent>
    );
}

function ModDetails({ mod, onClose }: { mod: ModDiscoveryData; onClose?: () => void }) {
    const [openTab, setOpenTab] = useState<string>("README");
    const iconSrc = useCachedIcon(mod.iconUrl);

    return (
        <MainPanelSection>
            <div className="mod-details-header">
                <img src={iconSrc} alt={`${mod.name} icon`} className="mod-details-icon" />

                {/* Text on the right */}
                <div className="mod-card-body">
                    <h3 className="minecraft-seven mod-card-title">{mod.name}</h3>
                    <p className="minecraft-seven mod-card-description">{mod.description}</p>
                    <p className="minecraft-seven mod-card-authors">By: {mod.authors.join(", ")}</p>
                </div>

                {/* Right side: downloads + button */}
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

            {/* <PanelIndent>
                <p>User generated content:</p>
            </PanelIndent> */}
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

function ModDetailsPopup({ mod, onClose }: { mod: ModDiscoveryData; onClose: () => void }) {
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

export function ModDiscovery() {
    const [searchText, setSearchText] = useState("");
    const [mods, setMods] = useState<ModDiscoveryData[]>(modsCache ?? []);
    const [fetching, setFetching] = useState(!modsCache);
    const [sortMode, setSortMode] = useState<SortMode>("downloads");

    useEffect(() => {
        if (modsCache) return;

        const fetchMods = async () => {
            try {
                const querySnapshot = await getDocs(collection(db, "mods"));
                const modsData = querySnapshot.docs.map(docSnap => ({
                    id: docSnap.id,
                    ...docSnap.data(),
                })) as ModDiscoveryData[];

                modsCache = modsData;
                setMods(modsData);
            } catch (e) {
                console.error("Failed to fetch mods:", e);
            } finally {
                setFetching(false);
            }
        };

        fetchMods();
    }, []);

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
                        <Dropdown
                            options={[
                                { label: "Downloads", value: "downloads" },
                                { label: "Newest", value: "date" },
                            ]}
                            value={sortMode}
                            setValue={setSortMode as React.Dispatch<React.SetStateAction<string>>}
                        />
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
                          <ModCard
                              key={mod.name}
                              mod={mod}
                              onOpenDetails={() => {
                                  Popup.useAsync<void>(({ submit }) => <ModDetailsPopup mod={mod} onClose={submit} />);
                              }}
                          />
                      ))}
            </div>

            <div className="launcher-footer">
                <div className="launcher-disclaimer">
                    <p className="minecraft-seven launcher-disclaimer-text">
                        Not approved by or associated with Mojang or Microsoft
                    </p>
                </div>
            </div>
        </div>
    );
}
