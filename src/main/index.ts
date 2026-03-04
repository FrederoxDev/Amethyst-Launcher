import { is } from "@electron-toolkit/utils";
import { app, BrowserWindow, dialog, ipcMain, Menu, MenuItem, nativeTheme } from "electron";
import { autoUpdater } from "electron-updater";
import * as fs from "fs";
import * as path from "path";

process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";

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
const appStateInitSentToRenderers = new Set<number>();

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
            mainWindow!.close();
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
    const senderId = event.sender.id;
    if (appStateInitSentToRenderers.has(senderId)) return;

    appStateInitSentToRenderers.add(senderId);
    event.sender.send("APP_STATE_INIT");
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();
// Other window is open, so don't create a new one
if (hasSingleInstanceLock === false) {
    app.quit();
}
// No window is open so create new
else {
    app.on("ready", () => {
        mainWindow = createWindow();

        mainWindow.webContents.once("did-finish-load", () => {
            mainWindow!.show();
        });
    });

    app.on("second-instance", () => {
        // When second instance is started, restore and focus on existing one.
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
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
