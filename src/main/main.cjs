const {app, Menu, BrowserWindow, ipcMain, nativeTheme, MenuItem} = require('electron');
const {autoUpdater} = require("electron-updater");
const {join} = require('path');

process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

/** @type {Electron.BrowserWindow} */
let mainWindow = null;

function createWindow(){
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        minWidth: 600,
        minHeight: 400,
        backgroundColor: "#1E1E1F",
        webPreferences: {
            preload: join(app.getAppPath(), '/src/preload/preload.cjs'),
            nodeIntegration: true,
            webSecurity: false,
            contextIsolation: false,
        },
        frame: false
    });

    win.setMenuBarVisibility(false);

    if (app.isPackaged) {
        win.loadURL(`file://${join(app.getAppPath(), '/build/public/index.html')}`).then();
    } else {
        win.loadURL('http://localhost:3000').then();
    }

    return win;
}

const windowMenu = new Menu()
windowMenu.append(new MenuItem({role:"toggleDevTools"}))
Menu.setApplicationMenu(windowMenu);

ipcMain.on('TITLE_BAR_ACTION', (event, args) => {
    switch (args) {
        case "TOGGLE_MAXIMIZED":
            mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
            break;
        case "MINIMIZE":
            mainWindow.minimize()
            break;
        case "CLOSE":
            mainWindow.close()
            break;
        default:
            break;
    }
})

ipcMain.on('WINDOW_UI_THEME', (event, args) => {
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
})

ipcMain.handle("get-app-path", () => {
    return app.getAppPath()
})

ipcMain.handle("get-appdata-path", () => {
    return process.env.APPDATA;
})

ipcMain.handle("get-localappdata-path", () => {
    return process.env.LOCALAPPDATA;
})

const hasSingleInstanceLock = app.requestSingleInstanceLock();
// Other window is open, so don't create a new one
if (hasSingleInstanceLock === false) {
	return app.quit();
}
// No window is open so create new
else {
    app.on('ready', () => {
        mainWindow = createWindow();
    })

    app.on('second-instance', () => {
        // When second instance is started, restore and focus on existing one.
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    })
}

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

ipcMain.handle('check-for-updates', () => {
    autoUpdater.checkForUpdates().then()
});

ipcMain.handle('set-auto-download', (event, bool) => {
    autoUpdater.autoDownload = bool;
});

ipcMain.handle('set-auto-install-on-app-quit', (event, bool) => {
    autoUpdater.autoInstallOnAppQuit = bool;
});

ipcMain.handle('update-download', async () => {
    await autoUpdater.downloadUpdate();
});

autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('update-available', info);
});

autoUpdater.on('update-not-available', (info) => {
    mainWindow.webContents.send('update-not-available', info);
});

autoUpdater.on('update-cancelled', (info) => {
    mainWindow.webContents.send('update-cancelled', info);
});

autoUpdater.on('download-progress', (info) => {
    mainWindow.webContents.send('download-progress', info);
});

autoUpdater.on('update-downloaded', () => {
    // mainWindow.webContents.send('update-downloaded', info);
    autoUpdater.quitAndInstall(true, true);
});

autoUpdater.on('error', (error) => {
    mainWindow.webContents.send('update-error', error);
});
