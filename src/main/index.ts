import { is } from "@electron-toolkit/utils";
import { app, BrowserWindow, dialog, ipcMain, Menu, MenuItem, nativeTheme } from "electron";
import { autoUpdater } from "electron-updater";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";

/**
 * Reads the launcher config straight off disk. Used during early startup
 * (before the renderer/store exist) to honor window-related settings.
 */
function readLauncherConfig(): Record<string, unknown> {
    const launcherConfigPath =
        process.platform === "win32"
            ? path.join(
                  process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
                  "Amethyst",
                  "Launcher",
                  "launcher_config.json"
              )
            : path.join(os.homedir(), ".amethyst", "launcher", "launcher_config.json");

    try {
        if (fs.existsSync(launcherConfigPath)) {
            return JSON.parse(fs.readFileSync(launcherConfigPath, "utf-8"));
        }
    } catch (e) {
        console.error("[main] Failed to read launcher config:", e);
    }
    return {};
}

const launcherConfig = readLauncherConfig();

// Honor the persisted hardware-acceleration setting. This MUST run before the
// app "ready" event.
if (launcherConfig.hardware_acceleration === false) {
    app.disableHardwareAcceleration();
    console.log("[main] Hardware acceleration disabled via launcher config.");
}

// When enabled, use the OS native window frame instead of the custom titlebar.
const useNativeDecorations = launcherConfig.native_decorations === true;

{
    const amethyst_appdata_path = path.join(app.getPath("appData"), "Amethyst", "Launcher", "AppData");
    if (!fs.existsSync(amethyst_appdata_path)) {
        fs.mkdirSync(amethyst_appdata_path, { recursive: true });
    }
    try {
        app.setPath("userData", amethyst_appdata_path);
    } catch (e) {
        console.error(e);
    }
}

let mainWindow: Electron.BrowserWindow | null = null;

function createWindow(): BrowserWindow {
    const win = new BrowserWindow({
        width: 1400,
        height: 780,
        minWidth: 1060,
        minHeight: 600,
        backgroundColor: "#1E1E1F",
        show: false,
        webPreferences: {
            preload: path.join(app.getAppPath(), "/out/preload/index.js"),
            nodeIntegration: true,
            webSecurity: false,
            contextIsolation: false,
        },
        frame: useNativeDecorations,
    });

    win.setMenuBarVisibility(false);

    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
        win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    } else {
        win.loadFile(path.join(__dirname, "../renderer/index.html"));
    }

    return win;
}

const windowMenu = new Menu();
windowMenu.append(new MenuItem({ role: "toggleDevTools" }));
windowMenu.append(new MenuItem({ role: "reload" }));
Menu.setApplicationMenu(windowMenu);

ipcMain.on("TITLE_BAR_ACTION", (_, args) => {
    switch (args) {
        case "TOGGLE_MAXIMIZED":
            mainWindow!.isMaximized() ? mainWindow!.unmaximize() : mainWindow!.maximize();
            break;
        case "MINIMIZE":
            mainWindow!.minimize();
            break;
        case "CLOSE":
            mainWindow!.destroy();
            break;
        default:
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
            nativeTheme.themeSource = "system";
            break;
    }
});

ipcMain.handle("get-app-path", () => {
    return app.getAppPath();
});

ipcMain.handle("get-appdata-path", () => {
    return app.getPath("home");
});

ipcMain.on("get-appdata-path-sync", event => {
    event.returnValue = app.getPath("appData");
});

ipcMain.handle("get-localappdata-path", () => {
    return process.env.LOCALAPPDATA;
});

ipcMain.handle("show-dialog", async (_, args) => {
    return await dialog.showOpenDialog(args);
});

ipcMain.handle("show-message", async (_, args) => {
    return await dialog.showMessageBox(args);
});

ipcMain.on("APP_STATE_INIT_REQUEST", event => {
    event.sender.send("APP_STATE_INIT");
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();

// Register the custom protocol so OS shortcuts can deep-link into the app.
app.setAsDefaultProtocolClient("amethyst-launcher");

/** Extracts the first amethyst-launcher:// URL from a argv array, or null. */
function extractProtocolUrl(argv: string[]): string | null {
    return argv.find(arg => arg.startsWith("amethyst-launcher://")) ?? null;
}

/** Forwards a protocol URL to the renderer if the window is ready. */
function handleProtocolUrl(url: string): void {
    console.log(`[main] Protocol URL received: ${url}`);
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
        mainWindow.webContents.send("AMETHYST_PROTOCOL_URL", url);
    }
}
// Other window is open, so don't create a new one
if (hasSingleInstanceLock === false) {
    app.quit();
}
// No window is open so create new
else {
    app.on("window-all-closed", () => {
        app.exit(0);
    });

    app.on("ready", () => {
        mainWindow = createWindow();

        // The window is created hidden (show: false) and revealed by whichever
        // of the triggers below fires first. `showWindow` is idempotent (the
        // isVisible guard) so racing triggers are safe. backgroundColor on the
        // window already prevents a white flash, so revealing slightly early is
        // harmless.
        let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

        const showWindow = (): void => {
            if (!mainWindow || mainWindow.isVisible()) return;
            if (fallbackTimer) {
                clearTimeout(fallbackTimer);
                fallbackTimer = null;
            }
            mainWindow.show();
            // Handle the case where the app was cold-started via a protocol URL.
            const url = extractProtocolUrl(process.argv);
            if (url) handleProtocolUrl(url);
        };

        // Primary path: the renderer signals once its store has hydrated and it
        // has painted real content. This runs from JS, so unlike "ready-to-show"
        // it does not depend on the GPU/compositor and fires reliably even when
        // hardware acceleration is misbehaving (e.g. some Debian/Wayland setups).
        ipcMain.once("RENDERER_READY", () => showWindow());

        // Fast path on healthy systems: the compositor's first frame is ready.
        mainWindow.once("ready-to-show", showWindow);

        // Hard guarantee: if neither signal arrives (broken GPU + a renderer
        // that never finished hydrating), reveal anyway so the window can never
        // be stuck permanently hidden.
        fallbackTimer = setTimeout(showWindow, 3000);
    });

    app.on("second-instance", (_event, commandLine) => {
        // When second instance is started, restore and focus on existing one.
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
        // Forward protocol URL if this instance was opened via deep-link.
        const url = extractProtocolUrl(commandLine);
        if (url) handleProtocolUrl(url);
    });
}

ipcMain.handle("get-app-version", () => {
    return app.getVersion();
});

ipcMain.handle("check-for-updates", () => {
    autoUpdater.checkForUpdates().then();
});

ipcMain.handle("set-auto-download", (_, bool) => {
    autoUpdater.autoDownload = bool;
});

ipcMain.handle("set-auto-install-on-app-quit", (_, bool) => {
    autoUpdater.autoInstallOnAppQuit = bool;
});

ipcMain.handle("update-download", async () => {
    await autoUpdater.downloadUpdate();
});

ipcMain.handle("dialog:openFile", async (_, filters) => {
    const result = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters,
    });
    return result.filePaths[0] ?? null;
});

autoUpdater.on("update-available", info => {
    mainWindow!.webContents.send("update-available", info);
});

autoUpdater.on("update-not-available", info => {
    mainWindow!.webContents.send("update-not-available", info);
});

autoUpdater.on("update-cancelled", info => {
    mainWindow!.webContents.send("update-cancelled", info);
});

autoUpdater.on("download-progress", info => {
    mainWindow!.webContents.send("download-progress", info);
});

autoUpdater.on("update-downloaded", () => {
    // mainWindow.webContents.send('update-downloaded', info);
    autoUpdater.quitAndInstall(true, true);
});

autoUpdater.on("error", error => {
    mainWindow!.webContents.send("update-error", error);
});
