import { logEvent } from "firebase/analytics";
import { collection, doc, getDocs, increment, updateDoc } from "firebase/firestore";
import * as fs from "fs";
import os from "os";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";

import { MainPanelSection, PanelButton, PanelIndent, PanelSection } from "@renderer/components/MainPanel";
import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { MinecraftButtonStyle } from "@renderer/components/MinecraftButtonStyle";
import { MinecraftRadialButtonPanel } from "@renderer/components/MinecraftRadialButtonPanel";
import { PopupPanel } from "@renderer/components/PopupPanel";
import { TextInput } from "@renderer/components/TextInput";

import { UseAppState } from "@renderer/contexts/AppState";

import { db } from "@renderer/firebase/Firebase";

import { Extractor } from "@renderer/scripts/backend/Extractor";

const { shell } = window.require("electron");
const path = window.require("path");

function getPaths() {
    return UseAppState.getState().platform.getPaths();
}

interface ModDiscoveryData {
    id: string;
    iconUrl: string;
    name: string;
    description: string;
    authors: string[];
    downloads: number;
    githubUrl: string;

    // Used to hide mods from the discovery page without deleting them
    hidden?: boolean;

    // Used exclusively for Amethyst org mods, no exceptions will be made to this
    isAmethystOrgMod?: boolean;
}

function ModCard({ mod, onOpenDetails }: { mod: ModDiscoveryData; onOpenDetails: () => void }) {
    return (
        <PanelButton className="mod-card" onClick={onOpenDetails}>
            <img src={mod.iconUrl} alt={`${mod.name} icon`} className="mod-card-icon img-pixelated" />

            {/* Text on the right */}
            <div className="mod-card-body">
                <h3 className="minecraft-seven mod-card-title">{mod.name}</h3>
                <p className="minecraft-seven mod-card-description">{mod.description}</p>
                <p className="minecraft-seven mod-card-authors">By: {mod.authors.join(", ")}</p>
            </div>

            {/* Right side: downloads + button */}
            <div className="mod-card-side">
                <p className="minecraft-seven mod-card-installs">Installs: {mod.downloads}</p>
            </div>
        </PanelButton>
    );
}

export function ModReadme({ githubUrl }: { githubUrl: string }) {
    const [readme, setReadme] = useState<string>("Loading...");

    useEffect(() => {
        const fetchReadme = async () => {
            try {
                // Convert GitHub URL to raw URL
                const rawUrl =
                    githubUrl.replace("https://github.com/", "https://raw.githubusercontent.com/").replace(/\/$/, "") +
                    "/main/README.md"; // assuming main branch

                const response = await fetch(rawUrl);
                if (!response.ok) throw new Error("README not found");
                const text = await response.text();
                setReadme(text);
            } catch (e) {
                setReadme("README could not be loaded.");
            }
        };

        fetchReadme();
    }, [githubUrl]);

    return (
        <PanelIndent>
            <div className="mod-readme-container">
                <ReactMarkdown
                    components={{
                        h1: ({ node, ...props }) => (
                            <h1 className="minecraft-seven mod-md-h1" {...props} />
                        ),
                        h2: ({ node, ...props }) => (
                            <h2 className="minecraft-seven mod-md-h2" {...props} />
                        ),
                        h3: ({ node, ...props }) => (
                            <h3 className="minecraft-seven mod-md-h3" {...props} />
                        ),
                        p: ({ node, ...props }) => (
                            <p className="minecraft-seven mod-md-p" {...props} />
                        ),
                        li: ({ node, ...props }) => (
                            <li className="minecraft-seven mod-md-li" {...props} />
                        ),
                        ol: ({ node, ...props }) => <ol className="mod-md-ol" {...props} />,
                        ul: ({ node, ...props }) => <ul className="mod-md-ul" {...props} />,
                        code: ({ node, ...props }) => (
                            <code className="minecraft-seven mod-md-code" {...props} />
                        ),
                        pre: ({ node, ...props }) => (
                            <pre className="mod-md-pre" {...props} />
                        ),
                        blockquote: ({ node, ...props }) => (
                            <blockquote className="mod-md-blockquote" {...props} />
                        ),
                        table: ({ node, ...props }) => (
                            <table className="minecraft-seven mod-md-table" {...props} />
                        ),
                        thead: ({ node, ...props }) => <thead className="mod-md-thead" {...props} />,
                        tr: ({ node, ...props }) => <tr className="mod-md-tr" {...props} />,
                        th: ({ node, ...props }) => (
                            <th className="minecraft-seven mod-md-th" {...props} />
                        ),
                        td: ({ node, ...props }) => (
                            <td className="minecraft-seven mod-md-td" {...props} />
                        ),
                        img: ({ node, ...props }) => {
                            if (props.src) return <img className="mod-md-img" {...props} />;
                            return null; // ignore all other HTML
                        },
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

async function downloadToTemp(url: string, filename: string): Promise<{ ok: boolean; path?: string; error?: string }> {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, error: `Failed to download: ${res.statusText}` };

    const buffer = await res.arrayBuffer();

    // tempdir
    const tempDir = os.tmpdir();
    const filePath = path.join(tempDir, filename);

    await fs.promises.writeFile(filePath, Buffer.from(buffer));

    console.log(`Downloaded to ${filePath}`);
    return { ok: true, path: filePath };
}

async function ImportZIP(zip_path: string): Promise<void> {
    try {
        const paths = getPaths();
        const zip_name = path.basename(zip_path);
        const extracted_folder_path = path.join(paths.modsPath, zip_name.slice(0, -".zip".length));
        console.log(extracted_folder_path);
        await Extractor.extractFile(zip_path, extracted_folder_path, [], undefined, success => {
            if (!success) {
                throw new Error("There was an error while extracting Mod ZIP!");
            }

            console.log("Successfully extracted Mod ZIP!");
        }).then();
    } catch (error) {
        // setError((error as Error).message)
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

export function ModDownloads({ mod }: { mod: ModDiscoveryData }) {
    const [releases, setReleases] = useState<ParsedGithubRelease[]>([]);
    const [loading, setLoading] = useState(true);
    const analyticsInstance = UseAppState(state => state.analyticsInstance);
    const allMods = UseAppState(state => state.allMods);
    const refreshAllMods = UseAppState(state => state.refreshAllMods);
    const [allInstalling, setAllInstalling] = useState<string[]>([]);
    const [confirmingMod, setConfirmingMod] = useState<ParsedGithubRelease | null>(null);

    useEffect(() => {
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

                setReleases(parsedData);
            } catch (err) {
                console.error("Error fetching releases", err);
            } finally {
                setLoading(false);
            }
        };

        fetchReleases();
    }, [mod.githubUrl]);

    const handleInstallClick = (release: ParsedGithubRelease, isTrusted: boolean) => {
        if (isTrusted) {
            // proceed directly
            installMod(release);
        } else {
            // show confirmation popup
            setConfirmingMod(release);
        }
    };

    const installMod = async (release: ParsedGithubRelease) => {
        setAllInstalling(prev => [...prev, release.download_name]);
        const { ok, path, error } = await downloadToTemp(release.download_url, release.download_name + ".zip");
        if (!ok) {
            console.error(error);
            setAllInstalling(prev => prev.filter(n => n !== release.download_name));
            setConfirmingMod(null);
            return;
        }

        await ImportZIP(path!);
        refreshAllMods();
        setAllInstalling(prev => prev.filter(n => n !== release.download_name));
        setConfirmingMod(null);

        // update download count in firestore
        console.log(`Incrementing download count for mod ${mod.id}`);

        const modDocRef = doc(db, "mods", mod.id);

        await updateDoc(modDocRef, {
            downloads: increment(1),
        });

        if (analyticsInstance) {
            logEvent(analyticsInstance, "mod_install", { mod_name: release.download_name });
        }
    };

    return (
        <PanelIndent>
            {confirmingMod && (
                <PopupPanel onExit={() => setConfirmingMod(null)}>
                    <div className="mod-confirm-popup" onClick={e => e.stopPropagation()}>
                        <MainPanelSection className="mod-confirm-content">
                            <p>{confirmingMod.download_name}</p>
                            <p className="mod-confirm-warning">
                                This mod is not officially published or reviewed by the Amethyst team. The code has not
                                been checked for security or stability issues, and may behave unexpectedly. Only install
                                if you trust the source.
                            </p>

                            {/* Spacer pushes buttons to bottom */}
                            <div className="mod-confirm-actions">
                                <MinecraftButton
                                    text="Continue"
                                    onClick={() => {
                                        if (confirmingMod) installMod(confirmingMod);
                                        setConfirmingMod(null);
                                    }}
                                />
                                <MinecraftButton
                                    text="Cancel"
                                    onClick={() => setConfirmingMod(null)}
                                    style={MinecraftButtonStyle.Warn}
                                />
                            </div>
                        </MainPanelSection>
                    </div>
                </PopupPanel>
            )}

            {loading && <p className="minecraft-seven mod-release-empty">Loading releases...</p>}
            {!loading && releases.length === 0 && (
                <p className="minecraft-seven mod-release-empty">No releases found.</p>
            )}
            {!loading &&
                releases.map(release => (
                    <PanelSection key={release.id} className="mod-release-row">
                        <div className="mod-release-info">
                            <p className="minecraft-seven mod-release-name">{release.download_name}</p>
                            <p className="minecraft-seven mod-release-date">
                                Published: {new Date(release.published_at).toLocaleDateString()}
                            </p>
                        </div>
                        <div className="mod-release-actions">
                            {allMods.find(mod => mod.id === release.download_name) === undefined && (
                                <button
                                    className="minecraft-seven mod-install-button"
                                    onClick={e => {
                                        e.stopPropagation();
                                        if (allInstalling.includes(release.download_name)) return;
                                        handleInstallClick(release, mod.isAmethystOrgMod ?? false);
                                    }}
                                >
                                    {allInstalling.includes(release.download_name) ? "Installing..." : "Install"}
                                </button>
                            )}

                            {/* Uninstall */}
                            {allMods.find(mod => mod.id === release.download_name) !== undefined && (
                                <button
                                    className="minecraft-seven mod-uninstall-button"
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
                                    Uninstall
                                </button>
                            )}
                        </div>
                    </PanelSection>
                ))}
        </PanelIndent>
    );
}

function ModDetails({ mod }: { mod: ModDiscoveryData }) {
    const [openTab, setOpenTab] = useState<string>("README");

    return (
        <MainPanelSection>
            <div className="mod-details-header">
                <img src={mod.iconUrl} alt={`${mod.name} icon`} className="mod-card-icon" />

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
            {openTab === "Versions" && <ModDownloads mod={mod} />}
        </MainPanelSection>
    );
}

function ModDetailsPopup({ mod, onClose }: { mod: ModDiscoveryData; onClose: () => void }) {
    return (
        <PopupPanel onExit={onClose}>
            <div className="mod-details-popup" onClick={e => e.stopPropagation()}>
                <ModDetails mod={mod} />
            </div>
        </PopupPanel>
    );
}

export function ModDiscovery() {
    const [searchText, setSearchText] = useState("");
    const [mods, setMods] = useState<ModDiscoveryData[]>([]);
    const [selectedMod, setSelectedMod] = useState<ModDiscoveryData | null>(null);

    useEffect(() => {
        const fetchMods = async () => {
            const querySnapshot = await getDocs(collection(db, "mods"));
            const modsData = querySnapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data(),
            })) as ModDiscoveryData[];

            setMods(modsData);
        };

        fetchMods();
    }, []);

    const filteredMods = mods
        .filter(mod => mod.name.toLowerCase().includes(searchText.toLowerCase()) && !mod.hidden)
        .sort((a, b) => b.downloads - a.downloads);

    return (
        <MainPanelSection>
            <p className="minecraft-seven mod-discovery-title">Mod Discovery</p>
            <TextInput label="Search" text={searchText} setText={setSearchText} />
            <PanelIndent>
                {filteredMods.map(mod => (
                    <ModCard key={mod.name} mod={mod} onOpenDetails={() => setSelectedMod(mod)} />
                ))}
            </PanelIndent>

            {selectedMod && <ModDetailsPopup mod={selectedMod} onClose={() => setSelectedMod(null)} />}
        </MainPanelSection>
    );
}
