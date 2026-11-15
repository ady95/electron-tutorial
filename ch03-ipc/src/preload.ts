// Preload 스크립트: Renderer에 꼭 필요한 기능만 골라서 노출한다.
// sandbox가 켜진 Preload에서는 electron 모듈만 불러올 수 있다 (Node.js 내장 모듈 불가).
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type ExposedApi, type MemoryUsage } from './shared/ipc';

const api: ExposedApi = {
  // 요청-응답: Main의 ipcMain.handle()이 돌려준 값을 Promise로 받는다
  getSystemInfo: () => ipcRenderer.invoke(IPC.getSystemInfo),

  // 단방향 알림: 응답이 필요 없을 때
  logMessage: (message) => ipcRenderer.send(IPC.logMessage, message),

  // Main → Renderer 알림 구독. 구독 해제 함수를 돌려준다
  onClockTick: (callback) => {
    const listener = (_event: IpcRendererEvent, time: string) => callback(time);
    ipcRenderer.on(IPC.clockTick, listener);
    return () => ipcRenderer.removeListener(IPC.clockTick, listener);
  },

  // Main → Renderer 메모리 사용량 구독. 구독 해제 함수를 돌려준다
  onMemoryUsage: (callback) => {
    const listener = (_event: IpcRendererEvent, usage: MemoryUsage) =>
      callback(usage);
    ipcRenderer.on(IPC.memoryUsage, listener);
    return () => ipcRenderer.removeListener(IPC.memoryUsage, listener);
  },
};

contextBridge.exposeInMainWorld('api', api);
