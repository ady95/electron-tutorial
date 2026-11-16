import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type ExposedApi, type LlmDelta } from './shared/ipc';

const api: ExposedApi = {
  openDocuments: () => ipcRenderer.invoke(IPC.openDocuments),
  importDocuments: (files) => ipcRenderer.invoke(IPC.importDocuments, files),
  listDocuments: () => ipcRenderer.invoke(IPC.listDocuments),
  getDocument: (id) => ipcRenderer.invoke(IPC.getDocument, id),
  removeDocument: (id) => ipcRenderer.invoke(IPC.removeDocument, id),
  getLlmSettings: () => ipcRenderer.invoke(IPC.getLlmSettings),
  saveLlmSettings: (settings) =>
    ipcRenderer.invoke(IPC.saveLlmSettings, settings),
  analyze: (request) => ipcRenderer.invoke(IPC.analyze, request),
  testConnection: () => ipcRenderer.invoke(IPC.testConnection),
  cancelAnalysis: (requestId) =>
    ipcRenderer.send(IPC.cancelAnalysis, requestId),
  onLlmDelta: (callback) => {
    // 이벤트 객체는 넘기지 않고 데이터만 넘긴다
    const listener = (_e: IpcRendererEvent, d: LlmDelta) => callback(d);
    ipcRenderer.on(IPC.llmDelta, listener);
    return () => ipcRenderer.removeListener(IPC.llmDelta, listener);
  },
  listAnalyses: (docId) => ipcRenderer.invoke(IPC.listAnalyses, docId),
  search: (query) => ipcRenderer.invoke(IPC.search, query),
  secretStatus: () => ipcRenderer.invoke(IPC.secretStatus),
  saveSecret: (value) => ipcRenderer.invoke(IPC.saveSecret, value),
  clearSecret: () => ipcRenderer.invoke(IPC.clearSecret),
  openDataFolder: () => ipcRenderer.send(IPC.openDataFolder),
};

contextBridge.exposeInMainWorld('api', api);
