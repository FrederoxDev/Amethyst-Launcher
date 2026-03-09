import { useAppStore } from "@renderer/states/AppStore";
import { GithubTools } from "../github/GithubTools";
import { Downloader } from "../Downloader";
import { Extractor } from "../Extractor";
import { PathUtils } from "../../PathUtils";
import { PopupPanel } from "@renderer/components/PopupPanel";
import { MainPanel, MainPanelSection, PanelIndent } from "@renderer/components/MainPanel";
import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { MinecraftButtonStyle } from "@renderer/components/MinecraftButtonStyle";
import { ProgressBar } from "@renderer/states/ProgressBarStore";
import { Popup } from "@renderer/states/PopupStore";
import { GithubRelease } from "../github/GithubRelease";

const path = window.require("path") as typeof import("path");
const fs = window.require("fs") as typeof import("fs");
const semver = window.require("semver") as typeof import("semver");

interface OutputModel { 
    message: string | null, 
    error: string | null, 
    progress: number | null,
    total: number | null,
    current: number | null
};

function XVDToolUpdatePopup({ 
    accept, 
    decline,
    currentVersion,
    upstreamVersion
}: { 
    accept: () => void, 
    decline: () => void,
    currentVersion: string,
    upstreamVersion: string
}) {
    return (
        <PopupPanel>
            <div className="app-consent-panel" onClick={e => e.stopPropagation()}>
                <MainPanel>
                    <MainPanelSection>
                        <p>New XVDTool update available</p>
                        <PanelIndent className="app-consent-indent">
                            <p>XVDTool is outdated, do you want to update it?</p>
                            <p>Current version: {currentVersion}</p>
                            <p>Latest version: {upstreamVersion}</p>
                        </PanelIndent>
                        <div className="app-consent-actions">
                            <MinecraftButton
                                text="Update!"
                                onClick={() => accept()}
                            />
                            <MinecraftButton
                                text="Don't update!"
                                style={MinecraftButtonStyle.Warn}
                                onClick={() => decline()}
                            />
                        </div>
                    </MainPanelSection>
                </MainPanel>
            </div>
        </PopupPanel>
    );
}

export class XVDTool {
    static readonly Repository: string = "raonygamer/xvdtool";

    private static async askUpdate(currentVersion: string, upstreamVersion: string): Promise<boolean> {
        return Popup.useAsync<boolean>(({ submit }) => {
            return <XVDToolUpdatePopup 
                accept={() => submit(true)} 
                decline={() => submit(false)} 
                currentVersion={currentVersion} 
                upstreamVersion={upstreamVersion} 
            />;
        });
    }

    static async check(shouldAskUpdate: boolean = false): Promise<{ version: string, path: string, executable: string }> {
        if (!XVDTool.isSupported()) {
            throw new Error("XVDTool is not supported on this platform.");
        }

        const launcherPath = useAppStore.getState().platform.getPaths().launcherPath;
        const toolsPath = path.join(launcherPath, "tools");
        const xvdtoolVersionFile = path.join(toolsPath, "xvdtool.txt");
        const xvdtoolPath = path.join(toolsPath, "xvdtool");

        PathUtils.ValidatePath(xvdtoolVersionFile);

        let currentVersion = "0.0.0";
        let toolIsInstalled = false;
        if (fs.existsSync(xvdtoolVersionFile) && fs.existsSync(xvdtoolPath) && fs.statSync(xvdtoolPath).isDirectory()) {
            currentVersion = fs.readFileSync(xvdtoolVersionFile, "utf-8").trim();
            toolIsInstalled = true;
        }

        let release: GithubRelease | undefined;
        try {
            release = await GithubTools.getLatestRelease(XVDTool.Repository, 1000);
        }
        catch (error) {
            console.error(`Failed to fetch XVDTool version from '${XVDTool.Repository}'!`);
            if (toolIsInstalled) {
                console.log(`Using outdated version (${currentVersion}) instead.`);
                return {
                    version: currentVersion,
                    path: path.join(toolsPath, "xvdtool"),
                    executable: process.platform === "win32" ? path.join(toolsPath, "xvdtool", "XVDTool.exe") : path.join(toolsPath, "xvdtool", "XVDTool")
                };
            }
            console.error("No XVDTool version available and failed to fetch latest version. Cannot continue.");
            throw error;
        }

        const latestVersion = release.tagName.replace(/^v/, "");
        if (semver.gte(currentVersion, latestVersion)) {
            console.log(`XVDTool is up to date (version ${currentVersion}).`);
            return {
                version: currentVersion,
                path: path.join(toolsPath, "xvdtool"),
                executable: process.platform === "win32" ? path.join(toolsPath, "xvdtool", "XVDTool.exe") : path.join(toolsPath, "xvdtool", "XVDTool")
            };
        }

        console.log(`Latest XVDTool version: ${latestVersion}, Installed version: ${currentVersion}`);
        if (toolIsInstalled) {
            if (!shouldAskUpdate) {
                console.log(`XVDTool update available but user will not be prompted due to shouldAskUpdate=false. Current version: ${currentVersion}, Latest version: ${latestVersion}`);
                return {
                    version: currentVersion,
                    path: path.join(toolsPath, "xvdtool"),
                    executable: process.platform === "win32" ? path.join(toolsPath, "xvdtool", "XVDTool.exe") : path.join(toolsPath, "xvdtool", "XVDTool")
                };
            }
            else {
                console.log(`XVDTool update available, prompting user for update. Current version: ${currentVersion}, Latest version: ${latestVersion}`);
                const userWantsUpdate = await XVDTool.askUpdate(currentVersion, latestVersion);
                if (!userWantsUpdate) {
                    console.log(`XVDTool update declined by user. Current version: ${currentVersion}, Latest version: ${latestVersion}`);
                    return {
                        version: currentVersion,
                        path: path.join(toolsPath, "xvdtool"),
                        executable: process.platform === "win32" ? path.join(toolsPath, "xvdtool", "XVDTool.exe") : path.join(toolsPath, "xvdtool", "XVDTool")
                    };
                }
            }
        }

        console.log(`Updating XVDTool from version ${currentVersion} to ${latestVersion}...`);
        await fs.promises.rm(path.join(toolsPath, "xvdtool"), { recursive: true, force: true });
        const asset = release.assets.find(a => 
            a.name.toLowerCase().includes("xvdtool") &&
            a.name.toLowerCase().endsWith(".zip") &&
            a.name.toLowerCase().includes(`${process.platform}-${process.arch}`));

        if (!asset) {
            throw new Error("No compatible XVDTool release found.");
        }

        await ProgressBar.useAsync(async ({ setStatus, setMessage, setProgress }) => {
            setStatus("downloading");
            await Downloader.downloadFile(asset.downloadUrl, path.join(toolsPath, `xvdtool-${process.platform}-${process.arch}.zip`), (downloaded, total) => {
                const percent = total > 0 ? downloaded / total : 0;
                setMessage(`Downloading XVDTool ${latestVersion}... (${(percent * 100).toFixed(2)}%)`);
                setProgress(percent);
            });

            await new Promise(resolve => setTimeout(resolve, 1000));
            setStatus("extracting");
            await Extractor.extractFile(path.join(toolsPath, `xvdtool-${process.platform}-${process.arch}.zip`), path.join(toolsPath, "xvdtool"), [], (fileIndex, totalFiles) => {
                const percent = totalFiles > 0 ? fileIndex / totalFiles : 0;
                setMessage(`Extracting XVDTool ${latestVersion}... (${(percent * 100).toFixed(2)}%)`);
                setProgress(percent);
            });
        });
        
        fs.rmSync(path.join(toolsPath, `xvdtool-${process.platform}-${process.arch}.zip`));
        if (process.platform === "linux") {
            await PathUtils.chmodRecursive(path.join(toolsPath, "xvdtool"), 0o755);
        }
        fs.writeFileSync(xvdtoolVersionFile, latestVersion);
        console.log(`XVDTool updated to version ${latestVersion}.`);

        return {
            version: latestVersion,
            path: path.join(toolsPath, "xvdtool"),
            executable: process.platform === "win32" ? path.join(toolsPath, "xvdtool", "XVDTool.exe") : path.join(toolsPath, "xvdtool", "XVDTool")
        };
    }

    static isSupported(): boolean {
        return (window.process.platform === "win32" || window.process.platform === "linux") && window.process.arch === "x64";
    }

    static async decrypt(inputFile: string, cikUuid: string, cikData: string, shouldAskUpdate: boolean = false): Promise<string | null> {
        const platform = useAppStore.getState().platform;
        const { executable: xvdtoolExecutable } = await XVDTool.check(shouldAskUpdate);
        const command = `"${xvdtoolExecutable}" -nd -eu -cik "${cikUuid}" -cikdata "${cikData}" "${inputFile}"`;
        return new Promise<string | null>(async (resolve, reject) => {
            await ProgressBar.useAsync(async ({ setStatus, setMessage, setProgress }) => {
                setStatus("decrypting");
                await platform.runCommand(command, (data) => {
                    for (const line of data.split("\n")) {
                        try {
                            const dataJson: OutputModel = { message: null, error: null, progress: null, total: null, current: null, ...JSON.parse(line) } as OutputModel;
                            if (dataJson.error) {
                                console.error(`[XVDTool] Error: ${dataJson.error}`);
                            }
                            
                            if (dataJson.message) {
                                console.log(`[XVDTool] ${dataJson.message}`);
                                setMessage(dataJson.message);
                            } 
                            
                            if (dataJson.progress !== null) {
                                setProgress(dataJson.progress);
                            } else if (dataJson.current !== null && dataJson.total !== null) {
                                setProgress((dataJson.current ?? 0) / (dataJson.total ?? 1));
                            }
                        }
                        catch {}
                    }
                }).catch(err => {
                    console.error("Failed to run XVDTool:", err);
                    reject(err);
                });
                resolve(null);
            });
        });
    }

    static async extract(inputFile: string, outputFolder: string, shouldAskUpdate: boolean = false): Promise<string | null> {
        const platform = useAppStore.getState().platform;
        const { executable: xvdtoolExecutable } = await XVDTool.check(shouldAskUpdate);
        const command = `"${xvdtoolExecutable}" -nd -xf "${outputFolder}" "${inputFile}"`;
        return new Promise<string | null>(async (resolve, reject) => {
            await ProgressBar.useAsync(async ({ setStatus, setMessage, setProgress }) => {
                setStatus("extracting");
                await platform.runCommand(command, (data) => {
                    for (const line of data.split("\n")) {
                        try {
                            const dataJson: OutputModel = { message: null, error: null, progress: null, total: null, current: null, ...JSON.parse(line) } as OutputModel;
                            if (dataJson.error) {
                                console.error(`[XVDTool] Error: ${dataJson.error}`);
                            }
                            
                            if (dataJson.message) {
                                console.log(`[XVDTool] ${dataJson.message}`);
                                setMessage(dataJson.message);
                            } 
                            
                            if (dataJson.progress !== null) {
                                setProgress(dataJson.progress);
                            } else if (dataJson.current !== null && dataJson.total !== null) {
                                setProgress((dataJson.current ?? 0) / (dataJson.total ?? 1));
                            }
                        }
                        catch {}
                    }
                }).catch(err => {
                    console.error("Failed to run XVDTool:", err);
                    reject(err);
                });
                resolve(null);
            });
        });
    }
}