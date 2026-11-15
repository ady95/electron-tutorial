import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type ExposedApi } from './shared/ipc';

const api: ExposedApi = {
  setTitle: (title) => ipcRenderer.send(IPC.setTitle, title),
};

contextBridge.exposeInMainWorld('api', api);
