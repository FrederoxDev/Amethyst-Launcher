import { PathUtils } from "@renderer/scripts/PathUtils";

const path = window.require("path") as typeof import("path");
const fs = window.require("fs") as typeof import("fs");
const child = window.require("child_process") as typeof import("child_process");
const { shellEnv } = window.require("shell-env") as typeof import("shell-env");

import { UseAppState } from "@renderer/contexts/AppState";
import { GithubTools } from "../github/GithubTools";
import { Downloader } from "../Downloader";
import { Extractor } from "../Extractor";
import { DEFAULT_STATUS } from "@renderer/scripts/LauncherStatus";

export class UMULauncher {
    private static Repository: string = "raonygamer/umu-launcher";

    static async check(): Promise<{ version: string, path: string, executable: string }> {
        if (process.platform !== "linux") {
            throw new Error("UMU Launcher is only supported on Linux.");
        }

        const launcherPath = UseAppState.getState().platform.getPaths().launcherPath;
        const toolsPath = path.join(launcherPath, "tools");
        const umuLauncherTagFile = path.join(toolsPath, "umu-launcher.txt");

        PathUtils.ValidatePath(umuLauncherTagFile);

        let currentTag: string | null = null;
        if (fs.existsSync(umuLauncherTagFile)) {
            currentTag = fs.readFileSync(umuLauncherTagFile, "utf-8").trim();
        }

        const release = await GithubTools.getLatestRelease(UMULauncher.Repository);
        const tag = release.tagName;

        if (currentTag === tag) {
            console.log(`UMU Launcher is up to date (version ${currentTag}).`);
            return {
                version: currentTag,
                path: path.join(toolsPath, "umu-launcher"),
                executable: path.join(toolsPath, "umu-launcher", "umu-run")
            };
        }

        console.log(`Updating UMU Launcher from version ${currentTag ?? "none"} to ${tag}...`);
        await fs.promises.rm(path.join(toolsPath, "umu-launcher"), { recursive: true, force: true });
        if (release.assets.length < 1)
            throw new Error("No assets found for the latest UMU Launcher release.");

        const asset = release.assets[0];
        if (!asset) {
            throw new Error("No compatible UMU Launcher release found.");
        }

        const appState = UseAppState.getState();
        const setStatus = appState.setStatus;
        
        setStatus(prev => ({ ...prev, 
            type: "downloading",
            taskName: `Downloading UMU Launcher ${tag}`,
            showLoading: true,
            canCancel: false,
            progress: 0
        }));

        const downloadPath = path.join(toolsPath, "umu-launcher.zip");
        await Downloader.downloadFile(asset.downloadUrl, downloadPath, (downloaded, total) => {
            const percent = total > 0 ? downloaded / total : 0;
            setStatus(prev => ({ ...prev, 
                taskName: `Downloading UMU Launcher ${tag}... (${(percent * 100).toFixed(2)}%)`,
                progress: percent
            }));
        });
        
        setStatus(prev => ({ ...prev,
            type: "extracting",
            taskName: `Downloaded UMU Launcher ${tag}. Extracting...`,
            progress: 0
        }));

        await new Promise(resolve => setTimeout(resolve, 1000));
        await Extractor.extractFile(downloadPath, path.join(toolsPath, "umu-launcher"), [], (fileIndex, totalFiles, name) => {
            const percent = totalFiles > 0 ? fileIndex / totalFiles : 0;
            setStatus(prev => ({ ...prev, 
                taskName: `Extracting ${name}... (${fileIndex}/${totalFiles})`,
                progress: percent
            }));
        });
        fs.rmSync(downloadPath);
        await PathUtils.chmodRecursive(path.join(toolsPath, "umu-launcher"), 0o755);
        fs.writeFileSync(umuLauncherTagFile, tag);
        
        setStatus(prev => ({ ...prev,
            type: "idle",
            taskName: `UMU Launcher updated to version ${tag}.`,
            progress: 0,
            showLoading: true,
            canCancel: false
        }));
    
        console.log(`UMU Launcher updated to version ${tag}.`);
        setStatus(DEFAULT_STATUS);
    
        return {
            version: tag,
            path: path.join(toolsPath, "umu-launcher"),
            executable: path.join(toolsPath, "umu-launcher", "umu-run")
        };
    }

    static async runGame(gamePath: string, envVars: Record<string, string>): Promise<void> {
        const { executable } = await UMULauncher.check();
        const envs = await shellEnv();
        const env = {
            ...envs,
            ...envVars,
        };

        const exec_proc = child.spawn(executable, [`${gamePath}`], {
            env: env,
            cwd: path.dirname(gamePath),
            stdio: ["ignore", "pipe", "pipe"]
        });

        exec_proc.stdout?.on("data", (data) => {
            console.log(`[UMU Launcher STDOUT] ${data}`);
        });

        exec_proc.stderr?.on("data", (data) => {
            console.log(`[UMU Launcher STDERR] ${data}`);
        });

        exec_proc.on("error", (err) => {
            console.error("Failed to run UMU Launcher:", err);
        });
    }
}