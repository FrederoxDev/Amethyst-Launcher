const path = window.require("path") as typeof import("path");
const fs = window.require("fs") as typeof import("fs");
const child = window.require("child_process") as typeof import("child_process");

import { UseAppState } from "@renderer/contexts/AppState";
import { PathUtils } from "../../PathUtils";
import { GithubTools } from "../github/GithubTools";
import { Downloader } from "../Downloader";
import { Extractor } from "../Extractor";
import { DEFAULT_STATUS } from "@renderer/scripts/LauncherStatus";

export class GDKProton {
    private static Repository: string = "raonygamer/gdk-proton";
    
    static async check(): Promise<{ version: string, path: string, executable: string }> {
        if (process.platform !== "linux") {
            throw new Error("GDK Proton is only supported on Linux.");
        }

        const launcherPath = UseAppState.getState().platform.getPaths().launcherPath;
        const toolsPath = path.join(launcherPath, "tools");
        const gdkProtonTagFile = path.join(toolsPath, "gdk-proton.txt");
    
        PathUtils.ValidatePath(gdkProtonTagFile);

        let currentTag: string | null = null;
        if (fs.existsSync(gdkProtonTagFile)) {
            currentTag = fs.readFileSync(gdkProtonTagFile, "utf-8").trim();
        }

        const release = await GithubTools.getLatestRelease(GDKProton.Repository);
        const tag = release.tagName;

        if (currentTag === tag) {
            console.log(`GDK Proton is up to date (version ${currentTag}).`);
            return {
                version: currentTag,
                path: path.join(toolsPath, "gdk-proton"),
                executable: path.join(toolsPath, "gdk-proton", "proton")
            };
        }

        console.log(`Updating GDK Proton from version ${currentTag ?? "none"} to ${tag}...`);
        await fs.promises.rm(path.join(toolsPath, "gdk-proton"), { recursive: true, force: true });
        if (release.assets.length < 1)
            throw new Error("No assets found for the latest GDK Proton release.");

        const asset = release.assets[0];
        if (!asset) {
            throw new Error("No compatible GDK Proton release found.");
        }

        const appState = UseAppState.getState();
        const setStatus = appState.setStatus;
        
        setStatus(prev => ({ ...prev, 
            type: "downloading",
            taskName: `Downloading GDK Proton ${tag}`,
            showLoading: true,
            canCancel: false,
            progress: 0
        }));

        const downloadPath = path.join(toolsPath, "gdk-proton.zip");
        await Downloader.downloadFile(asset.downloadUrl, downloadPath, (downloaded, total) => {
            const percent = total > 0 ? downloaded / total : 0;
            setStatus(prev => ({ ...prev, 
                taskName: `Downloading GDK Proton ${tag}... (${(percent * 100).toFixed(2)}%)`,
                progress: percent
            }));
        });
        
        setStatus(prev => ({ ...prev,
            type: "extracting",
            taskName: `Downloaded GDK Proton ${tag}. Extracting...`,
            progress: 0
        }));

        await new Promise(resolve => setTimeout(resolve, 1000));
        await Extractor.extractFile(downloadPath, path.join(toolsPath, "gdk-proton"), [], (fileIndex, totalFiles, name) => {
            const percent = totalFiles > 0 ? fileIndex / totalFiles : 0;
            setStatus(prev => ({ ...prev, 
                taskName: `Extracting ${name}... (${fileIndex}/${totalFiles})`,
                progress: percent
            }));
        });
        fs.rmSync(downloadPath);
        await PathUtils.chmodRecursive(path.join(toolsPath, "gdk-proton"), 0o755);
        fs.writeFileSync(gdkProtonTagFile, tag);
        
        setStatus(prev => ({ ...prev,
            type: "idle",
            taskName: `GDK Proton updated to version ${tag}.`,
            progress: 0,
            showLoading: true,
            canCancel: false
        }));
    
        console.log(`GDK Proton updated to version ${tag}.`);
        setStatus(DEFAULT_STATUS);
    
        return {
            version: tag,
            path: path.join(toolsPath, "gdk-proton"),
            executable: path.join(toolsPath, "gdk-proton", "proton")
        };
    }

    static isSupported(): boolean {
        return process.platform === "linux";
    }
}