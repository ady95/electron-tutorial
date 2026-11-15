import {
  contextBridge,
  ipcRenderer,
  webUtils,
  type IpcRendererEvent,
} from 'electron';
import { IPC, type ExposedApi, type MenuCommand } from './shared/ipc';

const api: ExposedApi = {
  setTitle: (title) => ipcRenderer.send(IPC.setTitle, title),
  setDirty: (dirty) => ipcRenderer.send(IPC.setDirty, dirty),
  resetFile: () => ipcRenderer.send(IPC.resetFile),
  openFile: () => ipcRenderer.invoke(IPC.openFile),
  // 드롭한 File 객체의 실제 경로는 Preload의 webUtils로만 알 수 있다
  openDroppedFile: (file) =>
    ipcRenderer.invoke(IPC.openDroppedFile, webUtils.getPathForFile(file)),
  saveFile: (text, saveAs) => ipcRenderer.invoke(IPC.saveFile, text, saveAs),
  onMenuCommand: (callback) => {
    const listener = (_event: IpcRendererEvent, command: MenuCommand) =>
      callback(command);
    ipcRenderer.on(IPC.menuCommand, listener);
    return () => ipcRenderer.removeListener(IPC.menuCommand, listener);
  },
};

contextBridge.exposeInMainWorld('api', api);
