"use strict";
const electron = require("electron");
if (process.contextIsolated) {
  electron.contextBridge.exposeInMainWorld("require", require);
} else {
  const globalWindow = window;
  globalWindow.require = require;
}
//# sourceMappingURL=index.js.map
