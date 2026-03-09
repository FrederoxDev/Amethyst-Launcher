import { ILauncherPlatform, LauncherPaths, ShortcutOptions } from "@renderer/scripts/platform/LauncherPlatform";
import { PathUtils } from "../PathUtils";
import { Profile } from "../Profiles";
import { GDKProton } from "../backend/tools/GDKProton";
import { UMULauncher } from "../backend/tools/UMULauncher";
import { InstalledVersionModel } from "../VersionManager";

const fs = window.require("fs") as typeof import("fs");
const os = window.require("os") as typeof import("os");
const child = window.require("child_process") as typeof import("child_process");
const path = window.require("path") as typeof import("path");

export class LinuxLauncherPlatform implements ILauncherPlatform {
    private static CachedLauncherPaths: LauncherPaths | null = null;

    async runCommand(command: string, stdout?: (data: string) => void): Promise<number> {
        return new Promise<number>((resolve, reject) => {
            const [cmd, ...args] = command.split(" ");
            const exec_proc = child.spawn(cmd, args, { shell: true });

            if (stdout) {
                exec_proc.stdout?.on("data", (data) => stdout(data.toString()));
            }

            exec_proc.stderr?.on("data", (data) => {
                console.error(`[Command Error] ${data}`);
            });

            exec_proc.on("close", (exit_code) => {
                if (exit_code !== 0) {
                    reject(new Error(`Command failed with exit code ${exit_code}.`));
                    return;
                }
                resolve(exit_code ?? 0);
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
            profilesFilePath: `${home}/.amethyst/launcher/profiles/profiles.json`,
            modsPath: `${home}/.amethyst/launcher/Mods`,
            launcherConfigPath: `${home}/.amethyst/launcher/launcher_config.json`,
            toolsPath: `${home}/.amethyst/launcher/tools`
        };

        PathUtils.ValidatePath(LinuxLauncherPlatform.CachedLauncherPaths.amethystPath);
        PathUtils.ValidatePath(LinuxLauncherPlatform.CachedLauncherPaths.launcherPath);
        PathUtils.ValidatePath(LinuxLauncherPlatform.CachedLauncherPaths.versionsPath);
        PathUtils.ValidatePath(LinuxLauncherPlatform.CachedLauncherPaths.versionsFilePath);
        PathUtils.ValidatePath(LinuxLauncherPlatform.CachedLauncherPaths.cachedVersionsFilePath);
        PathUtils.ValidatePath(LinuxLauncherPlatform.CachedLauncherPaths.profilesFilePath);
        PathUtils.ValidatePath(LinuxLauncherPlatform.CachedLauncherPaths.modsPath);
        PathUtils.ValidatePath(LinuxLauncherPlatform.CachedLauncherPaths.launcherConfigPath);
        PathUtils.ValidatePath(LinuxLauncherPlatform.CachedLauncherPaths.toolsPath);
        return LinuxLauncherPlatform.CachedLauncherPaths;
    }

    async runProfile(profile: Profile, version: InstalledVersionModel): Promise<void> {
        const versionPath = path.join(version.path, "Minecraft.Windows.exe");
        const gdkProtonInfo = await GDKProton.check();
        const prefixPath = path.join(this.getPaths().launcherPath, "gamedata", "default");
        fs.mkdirSync(path.join(prefixPath, "dosdevices"), { recursive: true });
        await UMULauncher.runGame(versionPath, {
            "WINEPREFIX": prefixPath,
            "PROTONPATH": gdkProtonInfo.path
        });
    }
}