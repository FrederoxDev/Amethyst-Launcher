import { ILauncherPlatform, LauncherPaths, ShortcutOptions } from "@renderer/scripts/platform/LauncherPlatform";
import { PathUtils } from "../PathUtils";

const fs = window.require("fs") as typeof import("fs");
const os = window.require("os") as typeof import("os");
const child = window.require("child_process") as typeof import("child_process");

export class LinuxLauncherPlatform implements ILauncherPlatform {
    private static CachedLauncherPaths: LauncherPaths | null = null;

    async runCommand(command: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const exec_proc = child.exec(command);
            exec_proc.on("exit", exit_code => {
                if (exit_code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Command failed with exit code ${exit_code}`));
                }
            });
        });
    }

    getPlatformFullName(): string {
        const osReleasePath = "/etc/os-release";
        if (fs.existsSync(osReleasePath)) {
            const osReleaseContent = fs.readFileSync(osReleasePath, "utf-8");
            const lines = osReleaseContent.split("\n");
            for (const line of lines) {
                if (line.startsWith("PRETTY_NAME=")) {
                    return `${line.split("=")[1].replace(/"/g, "")} ${os.release()} (${os.arch()})`;
                }
            }
        }
        return `Linux ${os.release()} (${os.arch()})`;
    }

    createShortcut(options: ShortcutOptions): Promise<void> {
        throw new Error("Shortcut creation is not implemented on Linux platforms.");
    }

    getPaths(): LauncherPaths {
        if (LinuxLauncherPlatform.CachedLauncherPaths)
            return LinuxLauncherPlatform.CachedLauncherPaths;

        const home: string = os.homedir();
        LinuxLauncherPlatform.CachedLauncherPaths = {
            amethystPath: `${home}/.amethyst`,
            launcherPath: `${home}/.amethyst/launcher`,
            versionsPath: `${home}/.amethyst/launcher/versions`,
            versionsFilePath: `${home}/.amethyst/launcher/versions/versions.json`,
            cachedVersionsFilePath: `${home}/.amethyst/launcher/versions/cached_versions.json`,
            profilesFilePath: `${home}/.amethyst/launcher/Profiles/profiles.json`,
            modsPath: `${home}/.amethyst/launcher/Mods`,
            launcherConfigPath: `${home}/.amethyst/launcher/launcher_config.json`
        };

        PathUtils.ValidatePath(LinuxLauncherPlatform.CachedLauncherPaths.amethystPath);
        PathUtils.ValidatePath(LinuxLauncherPlatform.CachedLauncherPaths.launcherPath);
        PathUtils.ValidatePath(LinuxLauncherPlatform.CachedLauncherPaths.versionsPath);
        PathUtils.ValidatePath(LinuxLauncherPlatform.CachedLauncherPaths.versionsFilePath);
        PathUtils.ValidatePath(LinuxLauncherPlatform.CachedLauncherPaths.cachedVersionsFilePath);
        PathUtils.ValidatePath(LinuxLauncherPlatform.CachedLauncherPaths.profilesFilePath);
        PathUtils.ValidatePath(LinuxLauncherPlatform.CachedLauncherPaths.modsPath);
        PathUtils.ValidatePath(LinuxLauncherPlatform.CachedLauncherPaths.launcherConfigPath);
        return LinuxLauncherPlatform.CachedLauncherPaths;
    }
}