// Main과 Renderer가 함께 쓰는 IPC 채널 이름과 타입

export const IPC = {
  pythonStatus: 'python:status',
  selectInput: 'report:select-input',
  runReport: 'report:run',
  cancelReport: 'report:cancel',
  reportProgress: 'report:progress',
  openReport: 'report:open',
} as const;

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
}
