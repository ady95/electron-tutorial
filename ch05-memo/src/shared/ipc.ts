// Main과 Preload가 함께 쓰는 IPC 채널 이름과 API 타입

export const IPC = {
  setTitle: 'window:set-title',
  setDirty: 'window:set-dirty',
  openFile: 'file:open',
  openDroppedFile: 'file:open-dropped',
  saveFile: 'file:save',
  resetFile: 'file:reset',
  menuCommand: 'menu:command',
} as const;

// 메뉴에서 Renderer로 보내는 명령
export type MenuCommand = 'new' | 'open' | 'save' | 'save-as';

// 파일 작업 결과: 예외 대신 결과 객체로 성공·실패를 알린다
export type FileResult =
  | { ok: true; name: string; text: string }
  | { ok: false; reason: 'canceled' }
  | { ok: false; reason: 'error'; message: string };

export type SaveResult =
  | { ok: true; name: string }
  | { ok: false; reason: 'canceled' }
  | { ok: false; reason: 'error'; message: string };

export interface ExposedApi {
  setTitle: (title: string) => void;
  setDirty: (dirty: boolean) => void;
  resetFile: () => void;
  openFile: () => Promise<FileResult>;
  openDroppedFile: (file: File) => Promise<FileResult>;
  saveFile: (text: string, saveAs: boolean) => Promise<SaveResult>;
  onMenuCommand: (callback: (command: MenuCommand) => void) => () => void;
}
