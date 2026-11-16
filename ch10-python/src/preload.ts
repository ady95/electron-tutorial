import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type ExposedApi, type ReportProgress } from './shared/ipc';

const api: ExposedApi = {
  pythonStatus: () => ipcRenderer.invoke(IPC.pythonStatus),
  selectInput: () => ipcRenderer.invoke(IPC.selectInput),
  runReport: (requestId) => ipcRenderer.invoke(IPC.runReport, requestId),
  cancelReport: (requestId) => ipcRenderer.send(IPC.cancelReport, requestId),
  onReportProgress: (callback) => {
    const listener = (_e: IpcRendererEvent, p: ReportProgress) => callback(p);
    ipcRenderer.on(IPC.reportProgress, listener);
    return () => ipcRenderer.removeListener(IPC.reportProgress, listener);
  },
  openReport: () => ipcRenderer.send(IPC.openReport),
};

contextBridge.exposeInMainWorld('api', api);
