import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type ExposedApi } from './shared/ipc';

const api: ExposedApi = {
  openDocuments: () => ipcRenderer.invoke(IPC.openDocuments),
  importDocuments: (files) => ipcRenderer.invoke(IPC.importDocuments, files),
  listDocuments: () => ipcRenderer.invoke(IPC.listDocuments),
  getDocument: (id) => ipcRenderer.invoke(IPC.getDocument, id),
  removeDocument: (id) => ipcRenderer.invoke(IPC.removeDocument, id),
  secretStatus: () => ipcRenderer.invoke(IPC.secretStatus),
  saveSecret: (value) => ipcRenderer.invoke(IPC.saveSecret, value),
  clearSecret: () => ipcRenderer.invoke(IPC.clearSecret),
  openDataFolder: () => ipcRenderer.send(IPC.openDataFolder),
};

contextBridge.exposeInMainWorld('api', api);
