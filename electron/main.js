console.log("ELECTRON MAIN FILE:", __filename);
const { app, BrowserWindow, shell, session, ipcMain } = require("electron");
const path = require("path");
const { startBackend, stopBackend } = require("./server-runner");

app.commandLine.appendSwitch("enable-media-stream");

const isDev = !app.isPackaged;
let mainWindow;

ipcMain.handle("open-external", (_event, url) => {
  if (typeof url !== "string") return false;
  if (!/^https?:\/\//i.test(url)) return false;
  shell.openExternal(url);
  return true;
});

async function createWindow() {
  await startBackend();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    icon: path.join(__dirname, "../client/public/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const startURL = isDev
    ? "http://localhost:3000"
    : `file://${path.join(__dirname, "../client/out/index.html")}`;

  mainWindow.loadURL(startURL);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  // ✅ Permission handler MUST be here
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      if (permission === "media") {
        console.log("Microphone permission granted");
        callback(true);
      } else {
        callback(false);
      }
    }
  );

  createWindow();
});

app.on("window-all-closed", () => {
  stopBackend();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.setAsDefaultProtocolClient("codemindai");

app.on("open-url", (event, url) => {
  event.preventDefault();
  const token = new URL(url).searchParams.get("token");
  mainWindow.webContents.send("oauth-token", token);
});
