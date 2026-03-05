import { ILauncherPlatform, LauncherPaths, ShortcutOptions } from "@renderer/scripts/platform/LauncherPlatform";
import { PathUtils } from "../PathUtils";
import { Profile } from "../Profiles";
import { InstalledVersion } from "../Versions";

const os = window.require("os") as typeof import("os");
const child = window.require("child_process") as typeof import("child_process");
const { ipcRenderer } = window.require("electron");

type RegeditModule = typeof import("regedit-rs");

export class WindowsLauncherPlatform implements ILauncherPlatform {
    private static CachedRegedit: RegeditModule | null;
    private static CachedWindowsShortcuts: typeof import("windows-shortcuts") | null;
    private static StartMenuFolder = `${os.homedir()}\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs`;
    private static CachedLauncherPaths: LauncherPaths | null = null;

    constructor() {
        WindowsLauncherPlatform.getRegeditModule();
        WindowsLauncherPlatform.getWindowsShortcutsModule();
    }

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
        return `Windows ${os.release()} (${os.arch()})`;
    }

    createShortcut(options: ShortcutOptions): Promise<void> {
        const windowsShortcuts = WindowsLauncherPlatform.getWindowsShortcutsModule();
        return new Promise<void>((resolve, reject) => {
            windowsShortcuts.create(WindowsLauncherPlatform.StartMenuFolder, {
                target: options.target,
                args: options.args,
                desc: options.description,
                icon: options.icon,
                workingDir: options.workingDir
            }, (err) => {
                if (err) {
                    reject(new Error(`Failed to create shortcut: ${err}`));
                } else {
                    resolve();
                }
            });
        });
    }

    getPaths(): LauncherPaths {
        if (WindowsLauncherPlatform.CachedLauncherPaths)
            return WindowsLauncherPlatform.CachedLauncherPaths;
        const appDataPath: string = ipcRenderer.sendSync("get-appdata-path");

        WindowsLauncherPlatform.CachedLauncherPaths = {
            amethystPath: `${appDataPath}\\Amethyst`,
            launcherPath: `${appDataPath}\\Amethyst\\Launcher`,
            versionsPath: `${appDataPath}\\Amethyst\\Launcher\\Versions`,
            versionsFilePath: `${appDataPath}\\Amethyst\\Launcher\\Versions\\versions.json`,
            cachedVersionsFilePath: `${appDataPath}\\Amethyst\\Launcher\\Versions\\cached_versions.json`,
            profilesFilePath: `${appDataPath}\\Amethyst\\Launcher\\Profiles\\profiles.json`,
            modsPath: `${appDataPath}\\Amethyst\\Launcher\\Mods`,
            launcherConfigPath: `${appDataPath}\\Amethyst\\Launcher\\launcher_config.json`
        };

        PathUtils.ValidatePath(WindowsLauncherPlatform.CachedLauncherPaths.amethystPath);
        PathUtils.ValidatePath(WindowsLauncherPlatform.CachedLauncherPaths.launcherPath);
        PathUtils.ValidatePath(WindowsLauncherPlatform.CachedLauncherPaths.versionsPath);
        PathUtils.ValidatePath(WindowsLauncherPlatform.CachedLauncherPaths.versionsFilePath);
        PathUtils.ValidatePath(WindowsLauncherPlatform.CachedLauncherPaths.cachedVersionsFilePath);
        PathUtils.ValidatePath(WindowsLauncherPlatform.CachedLauncherPaths.profilesFilePath);
        PathUtils.ValidatePath(WindowsLauncherPlatform.CachedLauncherPaths.modsPath);
        PathUtils.ValidatePath(WindowsLauncherPlatform.CachedLauncherPaths.launcherConfigPath);
        return WindowsLauncherPlatform.CachedLauncherPaths;
    }

    async runProfile(profile: Profile, version: InstalledVersion): Promise<void> {
        throw new Error("Running profiles is not implemented on Windows platforms yet.");
    }

    static getRegeditModule(): RegeditModule {
        if (WindowsLauncherPlatform.CachedRegedit)
            return WindowsLauncherPlatform.CachedRegedit;

        if (typeof process === "undefined" || process.platform !== "win32") {
            WindowsLauncherPlatform.CachedRegedit = null;
            throw new Error("regedit-rs module is only available on Windows platforms.");
        }

        try {
            WindowsLauncherPlatform.CachedRegedit = window.require("regedit-rs") as RegeditModule;
        } catch (e) {
            throw new Error(`Failed to load regedit-rs module. Ensure it is installed and available in the environment. \n ${e}`);
        }
        return WindowsLauncherPlatform.CachedRegedit;
    }

    static getWindowsShortcutsModule() {
        if (WindowsLauncherPlatform.CachedWindowsShortcuts)
            return WindowsLauncherPlatform.CachedWindowsShortcuts;
        
        if (typeof process === "undefined" || process.platform !== "win32") {
            WindowsLauncherPlatform.CachedWindowsShortcuts = null;
            throw new Error("windows-shortcuts module is only available on Windows platforms.");
        }

        try {
            WindowsLauncherPlatform.CachedWindowsShortcuts = window.require("windows-shortcuts") as typeof import("windows-shortcuts");
        } catch (e) {
            throw new Error(`Failed to load windows-shortcuts module. Ensure it is installed and available in the environment. \n ${e}`);
        }
        return WindowsLauncherPlatform.CachedWindowsShortcuts;
    }
}