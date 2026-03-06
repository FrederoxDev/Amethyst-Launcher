import { FULL_PROGRESS_RESET_OPTIONS, useAppStore, useProgressBar } from "@renderer/contexts/AppState";
import { GithubTools } from "../github/GithubTools";
import { Downloader } from "../Downloader";
import { Extractor } from "../Extractor";
import { PathUtils } from "../../PathUtils";

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

export class XVDTool {
    

    private static Repository: string = "raonygamer/xvdtool";

    static async check(): Promise<{ version: string, path: string, executable: string }> {
        if (!XVDTool.isSupported()) {
            throw new Error("XVDTool is not supported on this platform.");
        }

        const launcherPath = useAppStore.getState().platform.getPaths().launcherPath;
        const toolsPath = path.join(launcherPath, "tools");
        const xvdtoolVersionFile = path.join(toolsPath, "xvdtool.txt");

        PathUtils.ValidatePath(xvdtoolVersionFile);

        let currentVersion = "0.0.0";
        if (fs.existsSync(xvdtoolVersionFile)) {
            currentVersion = fs.readFileSync(xvdtoolVersionFile, "utf-8").trim();
        }

        const release = await GithubTools.getLatestRelease(XVDTool.Repository);
        const latestVersion = release.tagName.replace(/^v/, "");
        if (semver.gte(currentVersion, latestVersion)) {
            console.log(`XVDTool is up to date (version ${currentVersion}).`);
            return {
                version: currentVersion,
                path: path.join(toolsPath, "xvdtool"),
                executable: process.platform === "win32" ? path.join(toolsPath, "xvdtool", "XVDTool.exe") : path.join(toolsPath, "xvdtool", "XVDTool")
            };
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

        const { withProgressAsync } = useProgressBar.getState();
        await withProgressAsync(async ({ setStatus, setMessage, setProgress }) => {
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
        }, true, FULL_PROGRESS_RESET_OPTIONS);
        
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

    static async decrypt(inputFile: string, cikUuid: string, cikData: string): Promise<string | null> {
        const platform = useAppStore.getState().platform;
        const { withProgressAsync } = useProgressBar.getState();
        const { executable: xvdtoolExecutable } = await XVDTool.check();
        const command = `"${xvdtoolExecutable}" -nd -eu -cik "${cikUuid}" -cikdata "${cikData}" "${inputFile}"`;
        return new Promise<string | null>(async (resolve, reject) => {
            await withProgressAsync(async ({ setStatus, setMessage, setProgress }) => {
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
            }, true, FULL_PROGRESS_RESET_OPTIONS);
        });
    }

    static async extract(inputFile: string, outputFolder: string): Promise<string | null> {
        const platform = useAppStore.getState().platform;
        const { withProgressAsync } = useProgressBar.getState();
        const { executable: xvdtoolExecutable } = await XVDTool.check();
        const command = `"${xvdtoolExecutable}" -nd -xf "${outputFolder}" "${inputFile}"`;
        return new Promise<string | null>(async (resolve, reject) => {
            await withProgressAsync(async ({ setStatus, setMessage, setProgress }) => {
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
            }, true, FULL_PROGRESS_RESET_OPTIONS);
        });
    }
}