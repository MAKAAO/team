const { app, BrowserWindow, dialog, shell } = require("electron");
const path = require("path");
const {
  setupRemoteControlMain,
  setupScreenSharingMain,
  initPopupsConfigurationMain
} = require("@jitsi/electron-sdk/main");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    title: "Team Work",
    backgroundColor: "#f6f7fb",
    webPreferences: {
      preload: path.join(__dirname, "preload.bundle.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nativeWindowOpen: true
    }
  });

  setupScreenSharingMain(mainWindow, "Team Work");
  setupRemoteControlMain(mainWindow, {
    async requestConsent() {
      const answer = await dialog.showMessageBox(mainWindow, {
        type: "warning",
        title: "Allow remote control?",
        message: "A team member is requesting control of this computer.",
        detail: "Allow only if you recognize the person and are on a support call. You can deny this request.",
        buttons: ["Deny", "Allow for this session"],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      });
      return answer.response === 1;
    }
  });
  initPopupsConfigurationMain(mainWindow, ({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
