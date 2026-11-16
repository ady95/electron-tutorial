// Main과 Renderer가 함께 쓰는 IPC 채널 이름과 타입

// 2단계부터 Python 상태·진행률·결과·취소는 IPC가 아니라 Python 관리자와 직접 연결된
// MessagePort로 주고받는다(src/shared/host.ts). Main을 거치는 것은 대화상자와 경로뿐이다
export const IPC = {
  pythonPort: 'python:port', // Main → 화면: 관리자와 연결된 MessagePort 전달
  selectInput: 'report:select-input',
  startReport: 'report:start',
  openReport: 'report:open',
} as const;

export type StartResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

export type PythonStatus =
  | {
      ok: true;
      python: string;
      pandas: string;
      startupMs: number;
      mode: string;
    }
  | { ok: false; message: string };

export interface InputFolder {
  name: string; // 폴더 이름만 (전체 경로는 Main에만 둔다)
  files: number;
}

export interface ReportProgress {
  requestId: string;
  done: number;
  total: number;
  file: string;
}

export interface ReportSummary {
  outputName: string; // 파일 이름만
  files: number;
  rows: number;
  total: number;
  branches: string[];
  byMonth: (string | number)[][]; // [월, 지점1 매출, 지점2 매출, ...]
  errors: { file: string; message: string }[];
  elapsedMs: number;
}

export type ReportResult =
  | { ok: true; summary: ReportSummary }
  | { ok: false; code: string; message: string };

export interface ExposedApi {
  pythonStatus: () => Promise<PythonStatus>;
  selectInput: () => Promise<InputFolder | null>;
  runReport: (requestId: string) => Promise<ReportResult>;
  cancelReport: (requestId: string) => void;
  onReportProgress: (callback: (p: ReportProgress) => void) => () => void;
  openReport: () => void;
  onPythonRestart: (callback: () => void) => () => void; // 관리자가 다시 시작됐을 때
}
