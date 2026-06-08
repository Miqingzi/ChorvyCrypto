import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  saveFile: (options: { defaultName: string; filters: Array<{ name: string; extensions: string[] }> }) =>
    ipcRenderer.invoke("save-file", options),
  writeFile: (filePath: string, dataUrl: string) =>
    ipcRenderer.invoke("write-file", filePath, dataUrl),
  writeBlob: (filePath: string, arrayBuffer: number[]) =>
    ipcRenderer.invoke("write-blob", filePath, arrayBuffer),
  openFile: (filePath: string) => ipcRenderer.invoke("open-file", filePath),
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
  pickViewer: () => ipcRenderer.invoke("pick-viewer"),
  pickFolder: () => ipcRenderer.invoke("pick-folder"),
  toggleAlwaysOnTop: () => ipcRenderer.invoke("toggle-always-on-top"),
  getAlwaysOnTop: () => ipcRenderer.invoke("get-always-on-top"),
  minimizeWindow: () => ipcRenderer.invoke("minimize-window"),
  getCoverImage: () => ipcRenderer.invoke("get-cover-image"),
  closeWindow: () => ipcRenderer.invoke("close-window"),
  setOpacity: (value: number) => ipcRenderer.invoke("set-opacity", value),
  getOpacity: () => ipcRenderer.invoke("get-opacity"),
});
