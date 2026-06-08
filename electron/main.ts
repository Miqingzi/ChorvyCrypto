import { app, BrowserWindow, ipcMain, dialog, globalShortcut, shell } from "electron";
import * as path from "path";
import * as fs from "fs";

let mainWindow: BrowserWindow | null = null;

type SaveFileOptions = {
  defaultName: string;
  filters: Array<{ name: string; extensions: string[] }>;
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 620,
    x: 100,
    y: 100,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: true,
    hasShadow: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: app.isPackaged ? path.join(process.resourcesPath, "icon.png") : path.join(__dirname, "..", "assets", "icon.png"),
  });

  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true);
  mainWindow.loadFile(path.join(__dirname, "index.html"));

  if (process.argv.includes("--dev")) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.on("closed", () => { mainWindow = null; });
}

// --- IPC Handlers ---

ipcMain.handle("save-file", async (_event, options: SaveFileOptions) => {
  if (!mainWindow) return { canceled: true, filePath: null };
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: options.defaultName,
    filters: options.filters,
  });
  return { canceled: result.canceled, filePath: result.filePath || null };
});

ipcMain.handle("write-file", async (_event, filePath: string, dataUrl: string) => {
  try {
    const matches = dataUrl.match(/^data:.+;base64,(.+)$/);
    if (!matches) throw new Error("Invalid data URL");
    fs.writeFileSync(filePath, Buffer.from(matches[1], "base64"));
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle("write-blob", async (_event, filePath: string, arrayBuffer: number[]) => {
  try {
    fs.writeFileSync(filePath, Buffer.from(new Uint8Array(arrayBuffer)));
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle("open-file", async (_event, filePath: string) => {
  try {
    const errorMsg = await shell.openPath(filePath);
    if (errorMsg) throw new Error(errorMsg);
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle("open-external", async (_event, url: string) => {
  await shell.openExternal(url);
});

ipcMain.handle("pick-viewer", async () => {
  if (!mainWindow) return { canceled: true, filePath: null };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select image/video viewer",
    filters: [{ name: "Executables", extensions: ["exe"] }],
    properties: ["openFile"],
  });
  return { canceled: result.canceled, filePath: result.filePaths[0] || null };
});

ipcMain.handle("pick-folder", async () => {
  if (!mainWindow) return { canceled: true, filePath: null };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select save folder",
    properties: ["openDirectory"],
  });
  return { canceled: result.canceled, filePath: result.filePaths[0] || null };
});

ipcMain.handle("toggle-always-on-top", async () => {
  if (!mainWindow) return false;
  const current = mainWindow.isAlwaysOnTop();
  mainWindow.setAlwaysOnTop(!current, "screen-saver");
  return !current;
});

ipcMain.handle("get-always-on-top", async () => {
  return mainWindow?.isAlwaysOnTop() ?? true;
});

ipcMain.handle("minimize-window", async () => { mainWindow?.minimize(); });

ipcMain.handle("get-cover-image", async () => {
  try {
    const coverPath = path.join(__dirname, "..", "assets", "images", "girl_pearl_earring_1780013307983.png");
    const buf = fs.readFileSync(coverPath);
    return { success: true, dataUrl: "data:image/png;base64," + buf.toString("base64") };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});
ipcMain.handle("set-opacity", async (_event, value: number) => {
  if (mainWindow) {
    mainWindow.setOpacity(Math.max(0.3, Math.min(0.8, value)));
  }
});

ipcMain.handle("get-opacity", async () => {
  return mainWindow?.getOpacity() ?? 0.8;
});

ipcMain.handle("close-window", async () => { mainWindow?.close(); });

app.whenReady().then(() => {
  createWindow();
  globalShortcut.register("CommandOrControl+Shift+C", () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) { mainWindow.hide(); }
      else { mainWindow.show(); mainWindow.focus(); }
    }
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  globalShortcut.unregisterAll();
  if (process.platform !== "darwin") app.quit();
});
app.on("will-quit", () => { globalShortcut.unregisterAll(); });
