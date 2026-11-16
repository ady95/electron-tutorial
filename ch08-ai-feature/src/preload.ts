import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type ExposedApi, type Progress } from './shared/ipc';

const api: ExposedApi = {
  pickFolder: () => ipcRenderer.invoke(IPC.pickFolder),
  start: (rule, slow) => ipcRenderer.invoke(IPC.start, rule, slow),
  cancel: () => ipcRenderer.send(IPC.cancel),
  onProgress: (callback) => {
    const listener = (_e: IpcRendererEvent, p: Progress) => callback(p);
    ipcRenderer.on(IPC.progress, listener);
    return () => ipcRenderer.removeListener(IPC.progress, listener);
  },
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  saveSettings: (settings) => ipcRenderer.invoke(IPC.saveSettings, settings),
  searchHistory: (query) => ipcRenderer.invoke(IPC.searchHistory, query),
  clearHistory: () => ipcRenderer.invoke(IPC.clearHistory),
  exportHistory: (query) => ipcRenderer.invoke(IPC.exportHistory, query),
  secretStatus: () => ipcRenderer.invoke(IPC.secretStatus),
  saveSecret: (value) => ipcRenderer.invoke(IPC.saveSecret, value),
  clearSecret: () => ipcRenderer.invoke(IPC.clearSecret),
  openDataFolder: () => ipcRenderer.send(IPC.openDataFolder),
};

contextBridge.exposeInMainWorld('api', api);
