import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC,
  type ChatControl,
  type ChatEvent,
  type ExposedApi,
} from './shared/ipc';

const api: ExposedApi = {
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  saveSettings: (settings) => ipcRenderer.invoke(IPC.saveSettings, settings),
  secretStatus: (id) => ipcRenderer.invoke(IPC.secretStatus, id),
  saveSecret: (id, value) => ipcRenderer.invoke(IPC.saveSecret, id, value),
  clearSecret: (id) => ipcRenderer.invoke(IPC.clearSecret, id),

  // 요청마다 MessageChannel을 하나 만든다. 한쪽(port2)은 Main에 보내고, 다른 쪽(port1)은 여기 둔다.
  // 포트 자체는 화면(Renderer)에 넘기지 않고, 콜백과 cancel 함수만 넘긴다
  chat: (request, onEvent) => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = ({ data }: MessageEvent<ChatEvent>) => {
      onEvent(data);
      if (data.type === 'done' || data.type === 'error') port1.close();
    };
    ipcRenderer.postMessage(IPC.startChat, request, [port2]);
    return {
      cancel: () => {
        const control: ChatControl = { type: 'cancel' };
        port1.postMessage(control);
      },
    };
  },
  listLocalModels: () => ipcRenderer.invoke(IPC.listLocalModels),
  enableLocalAi: () => ipcRenderer.invoke(IPC.enableLocalAi),
};

contextBridge.exposeInMainWorld('api', api);
