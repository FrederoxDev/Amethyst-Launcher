const {app, BrowserWindow, ipcMain} = require('electron');
const path = require('path');
const {autoUpdater} = require("electron-updater");

let mainWindow = null;

function createWindow() {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        minWidth: 600,
        minHeight: 400,
        backgroundColor: "#1E1E1F",
        webPreferences: {
            nodeIntegration: true,
            preload: path.join(__dirname, 'preload.js'),
            sandbox: false, // false needed for exposing things like window.require
            webSecurity: false, // tell CORS to shut up lmao
            contextIsolation: false
        },
        titleBarStyle: "hidden",
        titleBarOverlay: {
            color: "#1E1E1F",
            symbolColor: "#FFFFFF",
            height: 40
        }
    });

    mainWindow = win;
    win.setMenuBarVisibility(false);

    if (app.isPackaged) {
        win.loadURL(`file://${path.join(__dirname, '../build/index.html')}`);
    } else {
        win.loadURL('http://localhost:3000');
    }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

ipcMain.handle('get-app-version', (event) => {
    return app.getVersion();
});

ipcMain.handle('check-for-updates', (event) => {
    autoUpdater.checkForUpdates().then(r => {
    });
});

ipcMain.handle('set-auto-download', (event, bool) => {
    autoUpdater.autoDownload = bool;
});

ipcMain.handle('set-auto-install-on-app-quit', (event, bool) => {
    autoUpdater.autoInstallOnAppQuit = bool;
});

ipcMain.handle('update-download', async (event) => {
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

autoUpdater.on('update-downloaded', (info) => {
    // mainWindow.webContents.send('update-downloaded', info);
    autoUpdater.quitAndInstall(true, true);
});

autoUpdater.on('error', (error) => {
    mainWindow.webContents.send('update-error', error);
});
