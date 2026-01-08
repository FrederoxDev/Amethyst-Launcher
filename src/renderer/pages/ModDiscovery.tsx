import { useEffect, useState } from "react";
import { MainPanel, MainPanelSection, PanelButton, PanelIndent, PanelSection } from "../components/MainPanel";
import { TextInput } from "../components/TextInput";
import { db } from "../firebase/Firebase";
import { getDocs, collection, updateDoc, increment, doc, getDoc } from "firebase/firestore";
import { PopupPanel } from "../components/PopupPanel";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { shell } from "electron";
import { MinecraftRadialButtonPanel } from "../components/MinecraftRadialButtonPanel";
import { UseAppState } from "../contexts/AppState";
import { logEvent } from "firebase/analytics";
import os from "os";
import path from "path";
import * as fs from "fs";
import { Extractor } from "../scripts/backend/Extractor";
import { ModsFolder } from "../scripts/Paths";
import { MinecraftButton } from "../components/MinecraftButton";
import { MinecraftButtonStyle } from "../components/MinecraftButtonStyle";

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

function ModCard({ mod, onOpenDetails }: { mod: ModDiscoveryData, onOpenDetails: () => void }) {
    const formattedDownloads = new Intl.NumberFormat('en-US', { 
        notation: 'compact',
        maximumFractionDigits: 2
    }).format(mod.downloads)
    
    return (
        <PanelButton 
            className="flex items-start gap-4 p-4 cursor-pointer"
            onClick={onOpenDetails}
        >
            <img 
                src={mod.iconUrl} 
                alt={`${mod.name} icon`} 
                className="w-16 h-16 flex-shrink-0 img-pixelated"
            />

            {/* Text on the right */}
            <div className="flex flex-col flex-1 min-w-0">
                <h3 className="minecraft-seven text-white text-[18px]">{mod.name}</h3>
                <p className="minecraft-seven text-[#BCBEC0] text-[14px] truncate">{mod.description}</p>
                <p className="minecraft-seven text-[#BCBEC0] text-[14px]">By: {mod.authors.join(", ")}</p>
            </div>
            {/* Right side: details (downloads) */}
            <div className="flex flex-col items-end justify-between ml-auto pr-2 w-48 h-16 flex-shrink-0">
                <p className="minecraft-seven text-[#BCBEC0] text-[14px] mb-2">{formattedDownloads} downloads</p>
            </div>
        </PanelButton>
    )
}

export function ModReadme({ githubUrl }: { githubUrl: string }) {
  const [readme, setReadme] = useState<string>("Loading...");

  useEffect(() => {
    const fetchReadme = async () => {
      try {
        // Convert GitHub URL to raw URL
        const rawUrl = githubUrl
          .replace("https://github.com/", "https://raw.githubusercontent.com/")
          .replace(/\/$/, "") + "/main/README.md"; // assuming main branch

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

  return <PanelIndent>
    <div className="m-2">
        <ReactMarkdown components={{
            h1: ({node, ...props}) => <h1 className="minecraft-seven text-white text-[24px] my-2" {...props} />,
            h2: ({node, ...props}) => <h2 className="minecraft-seven text-white text-[20px] my-2" {...props} />,
            h3: ({node, ...props}) => <h3 className="minecraft-seven text-white text-[18px] my-2" {...props} />,
            p: ({node, ...props}) => <p className="minecraft-seven text-[#BCBEC0] text-[14px] my-1" {...props} />,
            li: ({node, ...props}) => <li className="minecraft-seven text-[#BCBEC0] text-[14px] my-1" {...props} />,
            ol: ({node, ...props}) => <ol className="list-decimal ml-6 my-2" {...props} />,
            ul: ({node, ...props}) => <ul className="list-disc ml-6 my-2" {...props} />,
            code: ({node, ...props}) => <code className="minecraft-seven text-[#BCBEC0] px-1 rounded" {...props} />,
            pre: ({node, ...props}) => <pre className="bg-[#3e3e47] text-[#d4d5d6] p-2 rounded overflow-x-auto" {...props} />,
            blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-[#5a5b5c] pl-4 italic text-[#BCBEC0]" {...props} />,
            table: ({node, ...props}) => (
                <table className="minecraft-seven border-collapse border border-[#5a5b5c] my-3 w-full text-left" {...props} />
            ),
            thead: ({node, ...props}) => <thead className="bg-[#46464d]" {...props} />,
            tr: ({node, ...props}) => <tr className="border-b border-[#5a5b5c]" {...props} />,
            th: ({node, ...props}) => (
            <th className="minecraft-seven text-[#BCBEC0] text-[14px] font-bold px-3 py-2 border border-[#5a5b5c]" {...props} />
            ),
            td: ({node, ...props}) => (
            <td className="minecraft-seven text-[#BCBEC0] text-[14px] px-3 py-2 border border-[#5a5b5c]" {...props} />
            ),
            img: ({node, ...props}) => {
            if (props.src) return <img className="max-w-full h-auto my-2" {...props} />;
            return null; // ignore all other HTML
            },
            a: ({node, ...props}) => (
                <a
                    {...props}
                    className="minecraft-seven text-blue-400 underline"
                    onClick={(e) => {
                    e.preventDefault();
                    if (props.href) {
                        shell.openExternal(props.href); 
                    }
                    }}
                />
            )
        }} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
            {readme}
        </ReactMarkdown>
    </div>
  </PanelIndent>
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

async function downloadToTemp(url: string, filename: string): Promise<{ ok: boolean, path?: string, error?: string }> {
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
    const zip_name = path.basename(zip_path)
    const extracted_folder_path = path.join(ModsFolder, zip_name.slice(0, -'.zip'.length))
    console.log(extracted_folder_path)
    await Extractor.extractFile(zip_path, extracted_folder_path, [], undefined, success => {
        if (!success) {
        throw new Error('There was an error while extracting Mod ZIP!')
        }

        console.log('Successfully extracted Mod ZIP!')
    }).then()
    } catch (error) {
    // setError((error as Error).message)
    }
}

function uninstallMod(modName: string): void {
    const modPath = path.join(ModsFolder, modName);
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
    const { analyticsInstance, allValidMods, allInvalidMods, refreshAllMods, allMods } = UseAppState();
    const [allInstalling, setAllInstalling] = useState<string[]>([]);
    const [confirmingMod, setConfirmingMod] = useState<ParsedGithubRelease | null>(null);

    useEffect(() => {
        const repo = parseGitHubRepo(mod.githubUrl);
        if (!repo) return;

        const fetchReleases = async () => {
            try {
                const response = await fetch(
                `https://api.github.com/repos/${repo.owner}/${repo.repo}/releases`
                );
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
            downloads: increment(1)
        });

        if (analyticsInstance) {
            logEvent(analyticsInstance, "mod_install", { mod_name: release.download_name });
        }
    };

    return <PanelIndent>
        {confirmingMod && <PopupPanel onExit={() => setConfirmingMod(null)}>
            <div className="w-[45%] h-[25%]" onClick={e => e.stopPropagation()}>
                <MainPanelSection className="flex flex-col flex-1">
                    <p>{confirmingMod.download_name}</p>
                    <p className="text-[#BCBEC0]">
                    This mod is not officially published or reviewed by the Amethyst team. The code has not been checked for security or stability issues, and may behave unexpectedly. Only install if you trust the source.
                    </p>
                    
                    {/* Spacer pushes buttons to bottom */}
                    <div className="mt-auto flex justify-around gap-[8px]">
                        <MinecraftButton text='Continue' onClick={() => {
                            if (confirmingMod) installMod(confirmingMod);
                            setConfirmingMod(null);
                        }} />
                        <MinecraftButton text='Cancel' onClick={() => setConfirmingMod(null)} style={MinecraftButtonStyle.Warn} />
                    </div>
                </MainPanelSection>
            </div>
        </PopupPanel>}

        {loading && (<div className="flex justify-center items-center w-full h-full">
                        <p className="minecraft-seven text-[#BCBEC0] text-[14px] flex items-center justify-center h-full">Loading mods...</p>
                    </div>)}
        {!loading && releases.length === 0 && <p className="minecraft-seven text-[#BCBEC0] text-[14px]">No releases found.</p>}
        {!loading && releases.map(release => (
            <PanelSection key={release.id} className="flex items-center justify-between"> 
                <div className="flex flex-col">
                    <p className="minecraft-seven text-white text-[14px]">{release.download_name}</p>
                    <p className="minecraft-seven text-[#BCBEC0] text-[12px]">
                    Published: {new Date(release.published_at).toLocaleDateString()}
                    </p>
                </div>
                <div className="flex gap-2">
                    {(allMods.find(mod => mod.id === release.download_name) === undefined) && <button
                        className="minecraft-seven bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-[14px] mr-2"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (allInstalling.includes(release.download_name)) return;
                            handleInstallClick(release, mod.isAmethystOrgMod ?? false)
                        }}
                    >
                    {allInstalling.includes(release.download_name) ? "Installing..." : "Install" }
                    </button>}

                    {/* Uninstall */}
                    {(allMods.find(mod => mod.id === release.download_name) !== undefined) && <button
                        className="minecraft-seven bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-[14px] mr-2"
                        onClick={(e) => {
                            e.stopPropagation();
                            
                            uninstallMod(release.download_name);
                            refreshAllMods();

                            if (analyticsInstance) {
                                logEvent(analyticsInstance, "mod_uninstall", { mod_name: release.download_name });
                            }
                        }}
                    >
                    Uninstall
                    </button>}
                </div>
            </PanelSection>
        ))}
    </PanelIndent>
}

function ModDetails({ mod }: { mod: ModDiscoveryData }) {
    const [openTab, setOpenTab] = useState<string>('README');

    const formattedDownloads = new Intl.NumberFormat('en-US', { 
        notation: 'compact',
        maximumFractionDigits: 2
    }).format(mod.downloads)

    return (
        <MainPanelSection>
            <div className="flex items-start gap-4 p-4 ">
                <img 
                    src={mod.iconUrl} 
                    alt={`${mod.name} icon`} 
                    className="w-16 h-16 flex-shrink-0"
                />

                {/* Text on the right */}
                <div className="flex flex-col">
                    <h3 className="minecraft-seven text-white text-[18px]">{mod.name}</h3>
                    <p className="minecraft-seven text-[#BCBEC0] text-[14px]">{mod.description}</p>
                    <p className="minecraft-seven text-[#BCBEC0] text-[14px]">By: {mod.authors.join(", ")}</p>
                </div>

                {/* Right side: downloads + button */}
                <div className="flex flex-col items-end justify-between ml-auto pr-2">
                    <p className="minecraft-seven text-[#BCBEC0] text-[14px] mb-2">Downloads: {formattedDownloads}</p>
                    <a href={mod.githubUrl} target="_blank" rel="noopener noreferrer" 
                    className="minecraft-seven text-white text-[14px]"
                        onClick={(e) => {
                        e.preventDefault();
                        shell.openExternal(mod.githubUrl); 
                    }}>
                        Open In Github
                    </a>
                </div>
            </div>

            {/* <PanelIndent>
                <p>User generated content:</p>
            </PanelIndent> */}
            <MinecraftRadialButtonPanel
            elements={[
                { text: 'Description', value: 'README' },
                { text: 'Versions', value: 'Versions' },
            ]}
            default_selected_value={openTab}
            onChange={value => {
                setOpenTab(value)
            }}
        />
            {openTab === 'README' && <ModReadme githubUrl={mod.githubUrl} />}
            {openTab === 'Versions' && <ModDownloads mod={mod} />}
        </MainPanelSection>
    )
}

function ModDetailsPopup({ mod, onClose }: { mod: ModDiscoveryData, onClose: () => void }) {
    return (
        <PopupPanel onExit={onClose}>
            <div className="w-[80%] h-[80%]" onClick={e => e.stopPropagation()}>
                <ModDetails mod={mod} />
            </div>
        </PopupPanel>
    )
}

export function ModDiscovery() {
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [searchText, setSearchText] = useState('');
    const [mods, setMods] = useState<ModDiscoveryData[]>([]);
    const [selectedMod, setSelectedMod] = useState<ModDiscoveryData | null>(null);

    useEffect(() => {
        const fetchMods = async () => {
            const querySnapshot = await getDocs(collection(db, "mods"));
            const modsData = querySnapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data()
            })) as ModDiscoveryData[];

            setMods(modsData);
        };

        setIsLoading(true);
        fetchMods().then(() => setIsLoading(false));
    }, []);

    const filteredMods = mods
        .filter(mod =>
          mod.name.toLowerCase().includes(searchText.toLowerCase()) && !mod.hidden
        )
        .sort((a, b) => b.downloads - a.downloads);

    return (
        <MainPanelSection>
            <p className="minecraft-seven text-white text-[14px]">Mod Discovery</p>
            <TextInput label="Search" text={searchText} setText={setSearchText} />
            <PanelIndent>
                {isLoading && (
                    <div className="flex justify-center items-center w-full h-full">
                        <p className="minecraft-seven text-[#BCBEC0] text-[14px] flex items-center justify-center h-full">Loading mods...</p>
                    </div>
                )}
                {!isLoading && filteredMods.map(mod => <ModCard key={mod.name} mod={mod} onOpenDetails={() => setSelectedMod(mod)} />)}
            </PanelIndent>

            {selectedMod && (
                <ModDetailsPopup 
                    mod={selectedMod} 
                    onClose={() => setSelectedMod(null)} 
                />
            )}
        </MainPanelSection>
    )
}