const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // App info
  getVersion: () => ipcRenderer.invoke("get-version"),
  platform: process.platform,

  // File system (for terminal feature later)
  openFile: () => ipcRenderer.invoke("open-file-dialog"),
  saveFile: (content) => ipcRenderer.invoke("save-file", content),

  // Terminal (you'll expand this in Phase 2)
  onTerminalData: (cb) => ipcRenderer.on("terminal-data", (_, d) => cb(d)),
  sendTerminalInput: (data) => ipcRenderer.send("terminal-input", data),
});
