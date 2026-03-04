import { contextBridge } from "electron";
import * as path from "path";

if (process.contextIsolated) {
    contextBridge.exposeInMainWorld("require", require);
} else {
    const globalWindow = window as unknown as Window & { require: NodeRequire; joinPath: typeof path.join };
    globalWindow.require = require;
}
