import { contextBridge, ipcRenderer } from 'electron';
import type { PortEvent, PortRequest } from './shared/host';
import {
  IPC,
  type ExposedApi,
  type PythonStatus,
  type ReportProgress,
  type ReportResult,
  type StartResult,
} from './shared/ipc';

// Python 관리자와 연결된 MessagePort. 화면 코드(main world)에는 넘기지 않고 여기서만 쓴다
let port: MessagePort | null = null;
let portReady: () => void;
let ready = new Promise<void>((r) => (portReady = r));

const statusWaiters: ((s: PythonStatus) => void)[] = [];
const resultWaiters = new Map<string, (r: ReportResult) => void>();
const progressListeners = new Set<(p: ReportProgress) => void>();
const restartListeners = new Set<() => void>();

const post = (m: PortRequest) => port?.postMessage(m);

function onPortEvent(m: PortEvent) {
  if (m.type === 'status') {
    statusWaiters.splice(0).forEach((resolve) => resolve(m.status));
  } else if (m.type === 'progress') {
    progressListeners.forEach((cb) => cb(m.progress));
  } else if (m.type === 'result') {
    resultWaiters.get(m.jobId)?.(m.result);
    resultWaiters.delete(m.jobId);
  }
}

// Main이 새 통로를 보내 준다 (처음 불러올 때, 관리자가 다시 시작됐을 때)
ipcRenderer.on(IPC.pythonPort, (event) => {
  if (port) {
    port.close();
    // 이전 관리자에게 맡긴 작업은 결과가 오지 않는다
    for (const resolve of resultWaiters.values()) {
      resolve({
        ok: false,
        code: 'restarted',
        message: 'Python 관리자가 다시 시작되었습니다. 다시 실행하세요.',
      });
    }
    resultWaiters.clear();
    ready = Promise.resolve();
    queueMicrotask(() => restartListeners.forEach((cb) => cb()));
  }
  port = event.ports[0];
  port.onmessage = (e: MessageEvent<PortEvent>) => onPortEvent(e.data);
  portReady();
});

const api: ExposedApi = {
  pythonStatus: async () => {
    await ready;
    return new Promise((resolve) => {
      statusWaiters.push(resolve);
      post({ type: 'status' });
    });
  },
  selectInput: () => ipcRenderer.invoke(IPC.selectInput),
  runReport: async (jobId) => {
    await ready;
    // 결과는 관리자가 MessagePort로 보낸다. 시작 요청보다 먼저 기다릴 자리를 만든다
    const result = new Promise<ReportResult>((resolve) =>
      resultWaiters.set(jobId, resolve),
    );
    const started: StartResult = await ipcRenderer.invoke(
      IPC.startReport,
      jobId,
    );
    if (!started.ok) {
      resultWaiters.delete(jobId);
      return started;
    }
    return result;
  },
  cancelReport: (jobId) => post({ type: 'cancel', jobId }),
  onReportProgress: (callback) => {
    progressListeners.add(callback);
    return () => progressListeners.delete(callback);
  },
  openReport: () => ipcRenderer.send(IPC.openReport),
  onPythonRestart: (callback) => {
    restartListeners.add(callback);
    return () => restartListeners.delete(callback);
  },
};

contextBridge.exposeInMainWorld('api', api);
