import type { RenameRule } from './rename';

export const IPC = {
  pickFolder: 'batch:pick-folder',
  start: 'batch:start',
  cancel: 'batch:cancel',
  progress: 'batch:progress',
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

export interface ExposedApi {
  pickFolder: () => Promise<FolderInfo | null>;
  start: (rule: RenameRule, slow: boolean) => Promise<BatchResult>;
  cancel: () => void;
  onProgress: (callback: (p: Progress) => void) => () => void;
}
