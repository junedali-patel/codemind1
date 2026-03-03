const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const { startBackend, stopBackend } = require("./server-runner");

const isDev = !app.isPackaged;
let mainWindow;

async function createWindow() {
  // Start your Express backend first
  await startBackend();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    titleBarStyle: "hiddenInset", // macOS native feel
    icon: path.join(__dirname, "../client/public/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false, // IMPORTANT: keep false for security
    },
  });

  // In dev: load from Next.js dev server
  // In prod: load from built static files
  const startURL = isDev
    ? "http://localhost:3000"
    : `file://${path.join(__dirname, "../client/out/index.html")}`;

  mainWindow.loadURL(startURL);

  // Open external links in browser, not Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) mainWindow.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  stopBackend(); // Kill Express server on close
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// In electron/main.js — add this:
app.setAsDefaultProtocolClient('codemindai');

// Handle the OAuth callback URL: codemindai://auth/callback?token=...
app.on('open-url', (event, url) => {
  event.preventDefault();
  const token = new URL(url).searchParams.get('token');
  mainWindow.webContents.send('oauth-token', token);
});
