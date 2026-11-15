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
};

contextBridge.exposeInMainWorld('api', api);
