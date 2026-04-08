import { ILauncherPlatform, LauncherPaths, ProcessInfo, ShortcutOptions } from "@renderer/scripts/platform/LauncherPlatform";
import { EnsureVersionFiles, IsRegistered, LaunchMinecraft, RegisterVersion, UnregisterCurrent } from "../AppRegistry";
import { PathUtils } from "../PathUtils";
import { Profile } from "../Profiles";
import { InstalledVersionModel } from "../VersionManager";

const os = window.require("os") as typeof import("os");
const child = window.require("child_process") as typeof import("child_process");
const path = window.require("path") as typeof import("path");
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

    isProcessRunning(executableName: string): Promise<ProcessInfo | null> {
        return new Promise((resolve) => {
            // Use tasklist instead of PowerShell — much faster (~50ms vs ~2000ms).
            const proc = child.spawn(
                "tasklist",
                ["/FI", `IMAGENAME eq ${executableName}`, "/FO", "CSV", "/NH"],
                { encoding: "utf-8" } as any
            );

            let stdout = "";
            proc.stdout?.on("data", (data: string | Buffer) => { stdout += data.toString(); });
            proc.on("error", () => resolve(null));
            proc.on("close", () => {
                try {
                    const line = stdout.trim();
                    if (!line || line.includes("No tasks")) {
                        resolve(null);
                        return;
                    }
                    // CSV format: "name","pid","session","session#","mem"
                    const match = line.split("\n")[0]?.match(/^"[^"]+","(\d+)"/);
                    const pid = match ? parseInt(match[1], 10) : -1;
                    resolve({ pid, cwd: "", executableName });
                } catch {
                    resolve(null);
                }
            });
        });
    }

    createShortcut(options: ShortcutOptions): Promise<void> {
        const windowsShortcuts = WindowsLauncherPlatform.getWindowsShortcutsModule();
        const isProtocolUrl = options.target.startsWith("amethyst-launcher://");
        // For protocol URLs Windows needs the target to go through explorer.exe
        // since .lnk files cannot directly invoke custom URI schemes.
        const target = isProtocolUrl
            ? `${process.env.WINDIR ?? "C:\\Windows"}\\explorer.exe`
            : options.target;
        const args = isProtocolUrl
            ? options.target
            : options.args;
        return new Promise<void>((resolve, reject) => {
            const shortcutPath = path.join(WindowsLauncherPlatform.StartMenuFolder, `${options.name}.lnk`);
            windowsShortcuts.create(shortcutPath, {
                target,
                args,
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
        const appDataPath: string = ipcRenderer.sendSync("get-appdata-path-sync");

        WindowsLauncherPlatform.CachedLauncherPaths = {
            amethystPath: `${appDataPath}\\Amethyst`,
            launcherPath: `${appDataPath}\\Amethyst\\Launcher`,
            versionsPath: `${appDataPath}\\Amethyst\\Launcher\\Versions`,
            installedVersionsFilePath: `${appDataPath}\\Amethyst\\Launcher\\Versions\\installed_versions.json`,
            cachedVersionsFilePath: `${appDataPath}\\Amethyst\\Launcher\\Versions\\cached_versions.json`,
            profilesPath: `${appDataPath}\\Amethyst\\Launcher\\Profiles`,
            launcherConfigPath: `${appDataPath}\\Amethyst\\Launcher\\launcher_config.json`,
            toolsPath: `${appDataPath}\\Amethyst\\Launcher\\Tools`
        };

        PathUtils.ValidatePath(WindowsLauncherPlatform.CachedLauncherPaths.amethystPath);
        PathUtils.ValidatePath(WindowsLauncherPlatform.CachedLauncherPaths.launcherPath);
        PathUtils.ValidatePath(WindowsLauncherPlatform.CachedLauncherPaths.versionsPath);
        PathUtils.ValidatePath(WindowsLauncherPlatform.CachedLauncherPaths.installedVersionsFilePath);
        PathUtils.ValidatePath(WindowsLauncherPlatform.CachedLauncherPaths.cachedVersionsFilePath);
        (window.require("fs") as typeof import("fs")).mkdirSync(WindowsLauncherPlatform.CachedLauncherPaths.profilesPath, { recursive: true });
        PathUtils.ValidatePath(WindowsLauncherPlatform.CachedLauncherPaths.launcherConfigPath);
        PathUtils.ValidatePath(WindowsLauncherPlatform.CachedLauncherPaths.toolsPath);
        return WindowsLauncherPlatform.CachedLauncherPaths;
    }

    async runProfile(_profile: Profile, version: InstalledVersionModel, onStatus?: (message: string) => void): Promise<void> {
        const status = onStatus ?? (() => {});

        status("Ensuring version files...");
        await EnsureVersionFiles(version, status);

        if (!IsRegistered(version)) {
            status("Unregistering old version...");
            console.log("[WindowsPlatform] Unregistering current version...");
            await UnregisterCurrent();

            status("Registering version...");
            console.log("[WindowsPlatform] Registering version:", version.name);
            await RegisterVersion(version);
        }

        status("Launching Minecraft...");
        console.log("[WindowsPlatform] Launching Minecraft...");
        LaunchMinecraft(version);
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