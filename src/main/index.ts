// Imported first: opening the run's log file and installing the console shim has to happen
// before any other module gets a chance to log or throw.
import { discardRun, mainLog } from "./diagnostics/LogWriter";

import { is } from "@electron-toolkit/utils";
import { app, BrowserWindow, dialog, ipcMain, Menu, MenuItem, nativeTheme } from "electron";
import { autoUpdater } from "electron-updater";
import * as fs from "fs";
import * as path from "path";

import { describeError } from "../shared/diagnostics/Log";

process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";

{
    const amethyst_appdata_path = path.join(app.getPath("appData"), "Amethyst", "Launcher", "AppData");
    if (!fs.existsSync(amethyst_appdata_path)) {
        mainLog("INFO", "startup", `Creating userData folder ${amethyst_appdata_path}`);
        fs.mkdirSync(amethyst_appdata_path, { recursive: true });
    }
    try {
        app.setPath("userData", amethyst_appdata_path);
        mainLog("INFO", "startup", `userData set to ${amethyst_appdata_path}`);
    } catch (e) {
        mainLog("ERROR", "startup", `Could not set userData to ${amethyst_appdata_path}: ${describeError(e)}`);
    }
}

let mainWindow: Electron.BrowserWindow | null = null;

/** Every renderer-bound send goes through here, so a dropped message is never silent. */
function sendToWindow(scope: string, channel: string, payload?: unknown): boolean {
    if (!mainWindow) {
        mainLog("WARN", scope, `Dropped "${channel}": no window exists yet (payload ${describeError(payload)})`);
        return false;
    }
    if (mainWindow.isDestroyed()) {
        mainLog("WARN", scope, `Dropped "${channel}": window is destroyed (payload ${describeError(payload)})`);
        return false;
    }
    mainWindow.webContents.send(channel, payload);
    return true;
}

function createWindow(): BrowserWindow {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        minWidth: 600,
        minHeight: 400,
        backgroundColor: "#1E1E1F",
        show: false,
        webPreferences: {
            preload: path.join(app.getAppPath(), "/out/preload/index.js"),
            nodeIntegration: true,
            webSecurity: false,
            contextIsolation: false,
        },
        frame: false,
    });

    win.setMenuBarVisibility(false);

    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
        mainLog("INFO", "window", `Loading dev renderer from ${process.env["ELECTRON_RENDERER_URL"]}`);
        win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    } else {
        const file = path.join(__dirname, "../renderer/index.html");
        mainLog("INFO", "window", `Loading packaged renderer from ${file}`);
        win.loadFile(file);
    }

    win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
        mainLog("ERROR", "window", `Renderer failed to load ${validatedURL}: ${errorDescription} (${errorCode})`);
    });
    win.on("unresponsive", () => mainLog("WARN", "window", "Renderer stopped responding"));
    win.on("closed", () => mainLog("INFO", "window", "Main window closed"));

    return win;
}

const windowMenu = new Menu();
windowMenu.append(new MenuItem({ role: "toggleDevTools" }));
windowMenu.append(new MenuItem({ role: "reload" }));
Menu.setApplicationMenu(windowMenu);

ipcMain.on("TITLE_BAR_ACTION", (_, args) => {
    if (!mainWindow) {
        mainLog("WARN", "ipc", `TITLE_BAR_ACTION "${args}" ignored: no window exists`);
        return;
    }

    switch (args) {
        case "TOGGLE_MAXIMIZED":
            mainLog("INFO", "ipc", `TITLE_BAR_ACTION ${mainWindow.isMaximized() ? "unmaximize" : "maximize"}`);
            mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
            break;
        case "MINIMIZE":
            mainLog("INFO", "ipc", "TITLE_BAR_ACTION minimize");
            mainWindow.minimize();
            break;
        case "CLOSE":
            mainLog("INFO", "ipc", "TITLE_BAR_ACTION close, destroying window");
            mainWindow.destroy();
            break;
        default:
            mainLog("WARN", "ipc", `TITLE_BAR_ACTION ignored: unknown action "${args}"`);
            break;
    }
});

ipcMain.on("WINDOW_UI_THEME", (_, args) => {
    switch (args) {
        case "Light":
            nativeTheme.themeSource = "light";
            break;
        case "Dark":
            nativeTheme.themeSource = "dark";
            break;
        case "System":
            nativeTheme.themeSource = "system";
            break;
        default:
            mainLog("WARN", "ipc", `WINDOW_UI_THEME "${args}" is not a known theme, falling back to system`);
            nativeTheme.themeSource = "system";
            break;
    }
    mainLog("INFO", "ipc", `WINDOW_UI_THEME requested "${args}", themeSource is now "${nativeTheme.themeSource}"`);
});

/**
 * Every invoke handler reports what it answered and, on a throw, why. An IPC call that failed
 * silently used to show up in the renderer as a rejected promise with no trace of the channel.
 */
function handle<T>(
    channel: string,
    body: (...args: never[]) => T | Promise<T>,
    describe?: (result: T) => string
): void {
    ipcMain.handle(channel, async (_event, ...args) => {
        try {
            const result = await body(...(args as never[]));
            mainLog("INFO", "ipc", `${channel} -> ${describe ? describe(result) : "ok"}`);
            return result;
        } catch (e) {
            mainLog("ERROR", "ipc", `${channel} failed: ${describeError(e)}`);
            throw e;
        }
    });
}

handle("get-app-path", () => app.getAppPath(), result => result);
handle("get-appdata-path", () => app.getPath("home"), result => result);
handle("get-localappdata-path", () => process.env.LOCALAPPDATA ?? null, result => result ?? "LOCALAPPDATA is unset");

// Sync because every file the renderer writes stamps the version that wrote it, and the write
// paths are not async.
ipcMain.on("get-app-version-sync", (event) => {
    event.returnValue = app.getVersion();
});

ipcMain.on("get-appdata-path-sync", (event) => {
    const value = app.getPath("appData");
    mainLog("INFO", "ipc", `get-appdata-path-sync -> ${value}`);
    event.returnValue = value;
});

handle(
    "show-dialog",
    async (args: Electron.OpenDialogOptions) => await dialog.showOpenDialog(args),
    result => (result.canceled ? "cancelled by user" : `picked ${result.filePaths.join(", ")}`)
);

handle(
    "show-message",
    async (args: Electron.MessageBoxOptions) => await dialog.showMessageBox(args),
    result => `button ${result.response}`
);

ipcMain.on("APP_STATE_INIT_REQUEST", event => {
    mainLog("INFO", "ipc", "APP_STATE_INIT_REQUEST received, replying APP_STATE_INIT");
    event.sender.send("APP_STATE_INIT");
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();

// Register the custom protocol so OS shortcuts can deep-link into the app.
const protocolRegistered = app.setAsDefaultProtocolClient("amethyst-launcher");
mainLog("INFO", "startup", `amethyst-launcher:// protocol registration ${protocolRegistered ? "succeeded" : "failed"}`);

/** Extracts the first amethyst-launcher:// URL from a argv array, or null. */
function extractProtocolUrl(argv: string[]): string | null {
    return argv.find(arg => arg.startsWith("amethyst-launcher://")) ?? null;
}

/** Forwards a protocol URL to the renderer if the window is ready. */
function handleProtocolUrl(url: string): void {
    mainLog("INFO", "protocol", `Protocol URL received: ${url}`);
    if (!mainWindow) {
        mainLog("WARN", "protocol", `Dropping ${url}: no window exists yet, so nothing can act on it`);
        return;
    }

    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    sendToWindow("protocol", "AMETHYST_PROTOCOL_URL", url);
}

const MOD_ARCHIVE_EXTENSIONS = [".amethyst", ".zip"];

/** Extracts the first mod archive path from an argv array, or null. */
function extractModFilePath(argv: string[]): string | null {
    const candidates = argv.slice(1).filter(arg => !arg.startsWith("-"));
    const match = candidates.find(arg => MOD_ARCHIVE_EXTENSIONS.includes(path.extname(arg).toLowerCase())) ?? null;

    if (match) {
        mainLog("INFO", "fileopen", `argv holds mod archive "${match}"`);
    }
    else if (candidates.length > 0) {
        mainLog(
            "INFO",
            "fileopen",
            `No mod archive in argv: [${candidates.join(", ")}] carry no ${MOD_ARCHIVE_EXTENSIONS.join("/")} extension`
        );
    }

    return match;
}

let pendingModFilePath: string | null = null;

/** Forwards a mod archive path to the renderer, holding it until the window exists. */
function handleModFilePath(file_path: string): void {
    const resolved = path.resolve(file_path);
    mainLog("INFO", "fileopen", `Mod file open requested: ${file_path} (resolved ${resolved})`);

    if (!mainWindow) {
        mainLog("INFO", "fileopen", `Holding ${resolved} until the window exists`);
        pendingModFilePath = resolved;
        return;
    }

    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    sendToWindow("fileopen", "AMETHYST_OPEN_FILE", resolved);
}

// Other window is open, so don't create a new one
if (hasSingleInstanceLock === false) {
    mainLog("INFO", "startup", `Another instance holds the lock; handing over argv [${process.argv.slice(1).join(" ")}] and quitting`);
    discardRun();
    app.quit();
}
// No window is open so create new
else {
    mainLog("INFO", "startup", "Single instance lock acquired");

    app.on("window-all-closed", () => {
        mainLog("INFO", "shutdown", "All windows closed, exiting with code 0");
        app.exit(0);
    });

    app.on("before-quit", () => mainLog("INFO", "shutdown", "before-quit"));
    app.on("quit", (_event, exitCode) => mainLog("INFO", "shutdown", `quit with exit code ${exitCode}`));

    // macOS delivers file opens as an event instead of argv.
    app.on("open-file", (event, file_path) => {
        event.preventDefault();
        mainLog("INFO", "fileopen", `open-file event for ${file_path}`);
        handleModFilePath(file_path);
    });

    app.on("ready", () => {
        mainLog("INFO", "startup", `App ready, creating main window (version ${app.getVersion()})`);
        mainWindow = createWindow();

        mainWindow.once("ready-to-show", () => {
            mainLog("INFO", "window", "Window ready to show");
            mainWindow!.show();
            // Handle the case where the app was cold-started via a protocol URL.
            const url = extractProtocolUrl(process.argv);
            if (url) handleProtocolUrl(url);
            else mainLog("INFO", "protocol", "Cold start carried no amethyst-launcher:// URL");

            // Handle the case where the app was cold-started by opening a mod file.
            const filePath = extractModFilePath(process.argv) ?? pendingModFilePath;
            pendingModFilePath = null;
            if (filePath) handleModFilePath(filePath);
        });
    });

    app.on("second-instance", (_event, commandLine) => {
        mainLog("INFO", "startup", `second-instance argv: [${commandLine.slice(1).join(" ")}]`);
        // When second instance is started, restore and focus on existing one.
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
        else {
            mainLog("WARN", "startup", "second-instance arrived before this instance had a window");
        }

        // Forward protocol URL if this instance was opened via deep-link.
        const url = extractProtocolUrl(commandLine);
        if (url) handleProtocolUrl(url);

        // Forward mod file path if this instance was opened by a file association.
        const filePath = extractModFilePath(commandLine);
        if (filePath) handleModFilePath(filePath);
    });
}

handle("get-app-version", () => app.getVersion(), result => result);

handle("check-for-updates", () => {
    autoUpdater.checkForUpdates().catch(e => {
        mainLog("ERROR", "update", `checkForUpdates failed: ${describeError(e)}`);
    });
    return "check started";
}, result => result);

handle("set-auto-download", (value: boolean) => {
    autoUpdater.autoDownload = value;
    return value;
}, result => `autoDownload=${result}`);

handle("set-auto-install-on-app-quit", (value: boolean) => {
    autoUpdater.autoInstallOnAppQuit = value;
    return value;
}, result => `autoInstallOnAppQuit=${result}`);

handle("update-download", async () => {
    const files = await autoUpdater.downloadUpdate();
    return files;
}, result => `downloaded ${Array.isArray(result) ? result.join(", ") : String(result)}`);

handle(
    "dialog:openFile",
    async (filters: Electron.FileFilter[]) => {
        const result = await dialog.showOpenDialog({ properties: ["openFile"], filters });
        return result.filePaths[0] ?? null;
    },
    result => result ?? "cancelled by user"
);

autoUpdater.on("checking-for-update", () => mainLog("INFO", "update", "Checking for updates"));

autoUpdater.on("update-available", info => {
    mainLog("INFO", "update", `Update available: ${info.version} released ${info.releaseDate}`);
    sendToWindow("update", "update-available", info);
});

autoUpdater.on("update-not-available", info => {
    mainLog("INFO", "update", `No update available, newest is ${info.version} and this build is ${app.getVersion()}`);
    sendToWindow("update", "update-not-available", info);
});

autoUpdater.on("update-cancelled", info => {
    mainLog("WARN", "update", `Update ${info.version} cancelled`);
    sendToWindow("update", "update-cancelled", info);
});

let lastLoggedUpdatePercent = -1;
autoUpdater.on("download-progress", info => {
    // Fires many times a second; only whole 10% steps reach the log.
    const step = Math.floor(info.percent / 10) * 10;
    if (step !== lastLoggedUpdatePercent) {
        lastLoggedUpdatePercent = step;
        mainLog("INFO", "update", `Update download ${step}% (${info.transferred} of ${info.total} bytes)`);
    }
    sendToWindow("update", "download-progress", info);
});

autoUpdater.on("update-downloaded", () => {
    mainLog("INFO", "update", "Update downloaded, quitting to install");
    // mainWindow.webContents.send('update-downloaded', info);
    autoUpdater.quitAndInstall(true, true);
});

autoUpdater.on("error", error => {
    mainLog("ERROR", "update", `Updater error: ${describeError(error)}`);
    sendToWindow("update", "update-error", error);
});
