import { PathUtils } from "@renderer/scripts/PathUtils";

const path = window.require("path") as typeof import("path");
const fs = window.require("fs") as typeof import("fs");
const child = window.require("child_process") as typeof import("child_process");
const { shellEnv } = window.require("shell-env") as typeof import("shell-env");

import { useAppStore } from "@renderer/states/AppStore";
import { GithubTools } from "../github/GithubTools";
import { Downloader } from "../Downloader";
import { Extractor } from "../Extractor";
import { ProgressBar } from "@renderer/states/ProgressBarStore";
import { GithubRelease } from "../github/GithubRelease";

export class UMULauncher {
    private static Repository: string = "raonygamer/umu-launcher";

    static async check(): Promise<{ version: string, path: string, executable: string }> {
        if (process.platform !== "linux") {
            throw new Error("UMU Launcher is only supported on Linux.");
        }

        const launcherPath = useAppStore.getState().platform.getPaths().launcherPath;
        const toolsPath = path.join(launcherPath, "tools");
        const umuLauncherPath = path.join(toolsPath, "umu-launcher");
        const umuLauncherTagFile = path.join(toolsPath, "umu-launcher.txt");

        PathUtils.ValidatePath(umuLauncherTagFile);

        let toolIsInstalled = false;
        let currentTag: string | null = null;
        if (fs.existsSync(umuLauncherTagFile) && fs.existsSync(umuLauncherPath) && fs.statSync(umuLauncherPath).isDirectory()) {
            currentTag = fs.readFileSync(umuLauncherTagFile, "utf-8").trim();
            toolIsInstalled = true;
        }

        let release: GithubRelease | undefined;
        try {
            release = await GithubTools.getLatestRelease(UMULauncher.Repository, 1000);
        }
        catch (error) {
            console.error(`Failed to fetch UMU Launcher version from '${UMULauncher.Repository}'!`);
            if (toolIsInstalled) {
                console.log(`Using outdated version (${currentTag}) instead.`);
                return {
                    version: currentTag!,
                    path: path.join(toolsPath, "umu-launcher"),
                    executable: path.join(toolsPath, "umu-launcher", "umu-run")
                };
            }
            console.error("No UMU Launcher version available and failed to fetch latest version. Cannot continue.");
            throw error;
        }
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
        
        await ProgressBar.useAsync(async ({ setStatus, setMessage, setProgress }) => {
            setStatus("downloading");
            const downloadPath = path.join(toolsPath, "umu-launcher.zip");
            await Downloader.downloadFile(asset.downloadUrl, downloadPath, (downloaded, total) => {
                const percent = total > 0 ? downloaded / total : 0;
                setMessage(`Downloading UMU Launcher ${tag}... (${(percent * 100).toFixed(2)}%)`);
                setProgress(percent);
            });

            await new Promise(resolve => setTimeout(resolve, 1000));
            setStatus("extracting");
            await Extractor.extractFile(downloadPath, path.join(toolsPath, "umu-launcher"), [], (fileIndex, totalFiles) => {
                const percent = totalFiles > 0 ? fileIndex / totalFiles : 0;
                setMessage(`Extracting UMU Launcher ${tag}... (${(percent * 100).toFixed(2)}%)`);
                setProgress(percent);
            });
            fs.rmSync(downloadPath);
        });

        await PathUtils.chmodRecursive(path.join(toolsPath, "umu-launcher"), 0o755);
        fs.writeFileSync(umuLauncherTagFile, tag);
        console.log(`UMU Launcher updated to version ${tag}.`);
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
            stdio: ["ignore", "pipe", "pipe"],
            detached: true
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