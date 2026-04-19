import { ILauncherPlatform, LauncherPaths, ProcessInfo, ShortcutOptions } from "@renderer/scripts/platform/LauncherPlatform";
import { PathUtils } from "../PathUtils";
import { Profile } from "../Profiles";
import { LauncherTools } from "../backend/tools/LauncherTools";
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
        const isProtocolUrl = options.target.startsWith("amethyst-launcher://");
        const appName = options.name;
        const desktopDir = path.join(os.homedir(), ".local", "share", "applications");
        const desktopFile = path.join(desktopDir, `${appName}.desktop`);

        // For protocol URLs use xdg-open; otherwise invoke the executable directly.
        const exec = isProtocolUrl
            ? `xdg-open ${options.target}`
            : (options.args ? `${options.target} ${options.args}` : options.target);

        const lines = [
            "[Desktop Entry]",
            "Version=1.0",
            "Type=Application",
            `Name=${appName}`,
            options.description ? `Comment=${options.description}` : null,
            `Exec=${exec}`,
            options.workingDir ? `Path=${options.workingDir}` : null,
            options.icon ? `Icon=${options.icon}` : null,
            "Terminal=false",
            "Categories=Game;",
        ].filter(Boolean).join("\n") + "\n";

        fs.mkdirSync(desktopDir, { recursive: true });
        fs.writeFileSync(desktopFile, lines, { encoding: "utf-8" });
        fs.chmodSync(desktopFile, 0o755);

        // Notify the desktop environment to refresh the menu.
        child.spawn("update-desktop-database", [desktopDir], { detached: true, stdio: "ignore" }).unref();

        return Promise.resolve();
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
            toolsPath: `${home}/.amethyst/launcher/tools`,
            profileDataPath: `${home}/.amethyst/launcher/profile_data`
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

    async isProcessRunning(executableName: string): Promise<ProcessInfo | null> {
        try {
            for (const pid of fs.readdirSync("/proc")) {
                if (!/^\d+$/.test(pid)) continue;
                try {
                    const cwd = fs.readlinkSync(`/proc/${pid}/cwd`);
                    if (fs.existsSync(path.join(cwd, executableName))) {
                        return { pid: parseInt(pid, 10), cwd, executableName };
                    }
                } catch {
                    // process may have died or insufficient permissions — skip
                }
            }
        } catch {
            return null;
        }
        return null;
    }

    async runProfile(_profile: Profile, version: InstalledVersionModel, _onStatus?: (message: string) => void): Promise<void> {
        const versionPath = path.join(version.path, "Minecraft.Windows.exe");
        const prefixPath = path.join(this.getPaths().launcherPath, "gamedata", "default");
        fs.mkdirSync(path.join(prefixPath, "dosdevices"), { recursive: true });

        await LauncherTools.UMULauncher.runGame(versionPath, {
            "WINEPREFIX": prefixPath
        });
    }
}