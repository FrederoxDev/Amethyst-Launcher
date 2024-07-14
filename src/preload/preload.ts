import { contextBridge } from 'electron'

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('require', require)
} else {
  window.require = require
}
