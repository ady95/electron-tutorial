// Main과 Preload가 함께 쓰는 IPC 채널 이름과 데이터 형식

export const IPC = {
  getSystemInfo: 'system:get-info',
  clockTick: 'clock:tick',
  logMessage: 'log:message',
  memoryUsage: 'metrics:memory-usage',
} as const;

// app.getAppMetrics()로 구한 앱 전체 메모리 사용량 요약
export interface MemoryUsage {
  totalMB: number;
  processCount: number;
}

export interface SystemInfo {
  platform: string;
  arch: string;
  osVersion: string;
  cpuModel: string;
  cpuCount: number;
  totalMemoryGB: number;
  versions: {
    electron: string;
    chrome: string;
    node: string;
  };
}

// Preload가 window.api로 노출하는 API의 모양
export interface ExposedApi {
  getSystemInfo: () => Promise<SystemInfo>;
  logMessage: (message: string) => void;
  onClockTick: (callback: (time: string) => void) => () => void;
  onMemoryUsage: (callback: (usage: MemoryUsage) => void) => () => void;
}
