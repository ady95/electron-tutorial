import type { RenameRule } from './rename';

export const IPC = {
  pickFolder: 'batch:pick-folder',
  start: 'batch:start',
  cancel: 'batch:cancel',
  progress: 'batch:progress',
  getSettings: 'settings:get',
  saveSettings: 'settings:save',
  searchHistory: 'history:search',
  clearHistory: 'history:clear',
  exportHistory: 'history:export',
  secretStatus: 'secret:status',
  saveSecret: 'secret:save',
  clearSecret: 'secret:clear',
  openDataFolder: 'app:open-data-folder',
} as const;

export interface FolderInfo {
  folderName: string;
  files: string[];
}

export interface Progress {
  done: number;
  total: number;
  current: string;
}

export interface BatchResult {
  renamed: number;
  canceled: boolean;
  rolledBack: boolean;
  errors: string[];
}

// Renderer가 읽고 바꿀 수 있는 설정 (창 크기 등 Main 전용 설정은 포함하지 않는다)
export interface UserSettings {
  rule: RenameRule;
  slow: boolean;
}

export type JobStatus = 'done' | 'canceled' | 'failed';

// 이력 목록 한 줄. 전체 경로는 Renderer에 보내지 않고 폴더 이름만 보낸다
export interface JobSummary {
  id: number;
  startedAt: string;
  folderName: string;
  total: number;
  status: JobStatus;
  message: string;
  sample: string[]; // 이름 변경 계획 일부 (원래 이름 → 새 이름)
}

// CSV 내보내기 결과. 저장 경로는 Renderer에 보내지 않는다
export type ExportResult =
  | { status: 'canceled' }
  | { status: 'saved'; count: number }
  | { status: 'failed'; message: string };

export interface SecretStatus {
  available: boolean; // OS 암호화 사용 가능 여부
  saved: boolean;
  last4: string | null; // 저장된 키의 마지막 4자리 (확인용)
}

export interface ExposedApi {
  pickFolder: () => Promise<FolderInfo | null>;
  start: (rule: RenameRule, slow: boolean) => Promise<BatchResult>;
  cancel: () => void;
  onProgress: (callback: (p: Progress) => void) => () => void;
  getSettings: () => Promise<UserSettings>;
  saveSettings: (settings: UserSettings) => Promise<boolean>;
  searchHistory: (query: string) => Promise<JobSummary[]>;
  clearHistory: () => Promise<number>;
  exportHistory: (query: string) => Promise<ExportResult>;
  secretStatus: () => Promise<SecretStatus>;
  saveSecret: (value: string) => Promise<{ ok: boolean; message?: string }>;
  clearSecret: () => Promise<void>;
  openDataFolder: () => void;
}
