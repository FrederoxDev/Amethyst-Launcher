"use strict";
const utils = require("@electron-toolkit/utils");
const electron = require("electron");
const electronUpdater = require("electron-updater");
const fs = require("fs");
const path = require("path");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const fs__namespace = /* @__PURE__ */ _interopNamespaceDefault(fs);
const path__namespace = /* @__PURE__ */ _interopNamespaceDefault(path);
process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";
{
  const amethyst_appdata_path = path__namespace.join(electron.app.getPath("appData"), "Amethyst", "Launcher", "AppData");
  if (!fs__namespace.existsSync(amethyst_appdata_path)) {
    fs__namespace.mkdirSync(amethyst_appdata_path, { recursive: true });
  }
  try {
    electron.app.setPath("userData", amethyst_appdata_path);
  } catch (e) {
    console.error(e);
  }
}
let mainWindow = null;
const appStateInitSentToRenderers = /* @__PURE__ */ new Set();
function createWindow() {
  const win = new electron.BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 600,
    minHeight: 400,
    backgroundColor: "#1E1E1F",
    show: false,
    webPreferences: {
      preload: path__namespace.join(electron.app.getAppPath(), "/out/preload/index.js"),
      nodeIntegration: true,
      webSecurity: false,
      contextIsolation: false
    },
    frame: false
  });
  win.setMenuBarVisibility(false);
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    win.loadFile(path__namespace.join(__dirname, "../renderer/index.html"));
  }
  return win;
}
const windowMenu = new electron.Menu();
windowMenu.append(new electron.MenuItem({ role: "toggleDevTools" }));
windowMenu.append(new electron.MenuItem({ role: "reload" }));
electron.Menu.setApplicationMenu(windowMenu);
electron.ipcMain.on("TITLE_BAR_ACTION", (_, args) => {
  switch (args) {
    case "TOGGLE_MAXIMIZED":
      mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
      break;
    case "MINIMIZE":
      mainWindow.minimize();
      break;
    case "CLOSE":
      mainWindow.close();
      break;
  }
});
electron.ipcMain.on("WINDOW_UI_THEME", (_, args) => {
  switch (args) {
    case "Light":
      electron.nativeTheme.themeSource = "light";
      break;
    case "Dark":
      electron.nativeTheme.themeSource = "dark";
      break;
    case "System":
      electron.nativeTheme.themeSource = "system";
      break;
    default:
      electron.nativeTheme.themeSource = "system";
      break;
  }
});
electron.ipcMain.handle("get-app-path", () => {
  return electron.app.getAppPath();
});
electron.ipcMain.handle("get-appdata-path", () => {
  return electron.app.getPath("home");
});
electron.ipcMain.handle("get-localappdata-path", () => {
  return process.env.LOCALAPPDATA;
});
electron.ipcMain.handle("show-dialog", async (_, args) => {
  return await electron.dialog.showOpenDialog(args);
});
electron.ipcMain.handle("show-message", async (_, args) => {
  return await electron.dialog.showMessageBox(args);
});
electron.ipcMain.on("APP_STATE_INIT_REQUEST", (event) => {
  const senderId = event.sender.id;
  if (appStateInitSentToRenderers.has(senderId)) return;
  appStateInitSentToRenderers.add(senderId);
  event.sender.send("APP_STATE_INIT");
});
const hasSingleInstanceLock = electron.app.requestSingleInstanceLock();
if (hasSingleInstanceLock === false) {
  electron.app.quit();
} else {
  electron.app.on("ready", () => {
    mainWindow = createWindow();
    mainWindow.webContents.once("did-finish-load", () => {
      mainWindow.show();
    });
  });
  electron.app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
electron.ipcMain.handle("get-app-version", () => {
  return electron.app.getVersion();
});
electron.ipcMain.handle("check-for-updates", () => {
  electronUpdater.autoUpdater.checkForUpdates().then();
});
electron.ipcMain.handle("set-auto-download", (_, bool) => {
  electronUpdater.autoUpdater.autoDownload = bool;
});
electron.ipcMain.handle("set-auto-install-on-app-quit", (_, bool) => {
  electronUpdater.autoUpdater.autoInstallOnAppQuit = bool;
});
electron.ipcMain.handle("update-download", async () => {
  await electronUpdater.autoUpdater.downloadUpdate();
});
electron.ipcMain.handle("dialog:openFile", async (_, filters) => {
  const result = await electron.dialog.showOpenDialog({
    properties: ["openFile"],
    filters
  });
  return result.filePaths[0] ?? null;
});
electronUpdater.autoUpdater.on("update-available", (info) => {
  mainWindow.webContents.send("update-available", info);
});
electronUpdater.autoUpdater.on("update-not-available", (info) => {
  mainWindow.webContents.send("update-not-available", info);
});
electronUpdater.autoUpdater.on("update-cancelled", (info) => {
  mainWindow.webContents.send("update-cancelled", info);
});
electronUpdater.autoUpdater.on("download-progress", (info) => {
  mainWindow.webContents.send("download-progress", info);
});
electronUpdater.autoUpdater.on("update-downloaded", () => {
  electronUpdater.autoUpdater.quitAndInstall(true, true);
});
electronUpdater.autoUpdater.on("error", (error) => {
  mainWindow.webContents.send("update-error", error);
});
//# sourceMappingURL=index.js.map
