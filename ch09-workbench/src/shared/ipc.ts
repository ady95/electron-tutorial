// Main과 Renderer가 함께 쓰는 IPC 채널 이름과 데이터 형식
export const IPC = {
  openDocuments: 'docs:open',
  importDocuments: 'docs:import',
  listDocuments: 'docs:list',
  getDocument: 'docs:get',
  removeDocument: 'docs:remove',
  secretStatus: 'secret:status',
  saveSecret: 'secret:save',
  clearSecret: 'secret:clear',
  openDataFolder: 'app:open-data-folder',
} as const;

export type DocKind = 'text' | 'pdf';

// 문서 목록 한 줄. 원본 파일 경로는 Renderer에 보내지 않는다
export interface DocSummary {
  id: number;
  name: string;
  kind: DocKind;
  chars: number;
  pages: number | null; // PDF만
  encoding: string | null; // 텍스트 파일만 (utf-8, euc-kr 등)
  addedAt: string;
  warning: string | null; // 예: 글자가 없는 PDF
}

export interface DocDetail extends DocSummary {
  text: string;
}

// 드래그 앤 드롭으로 받은 파일. 경로 대신 이름과 내용을 보낸다
export interface DroppedFile {
  name: string;
  data: Uint8Array;
}

export interface ImportResult {
  added: DocSummary[];
  errors: { name: string; message: string }[];
}

export interface SecretStatus {
  available: boolean; // OS 암호화 사용 가능 여부
  saved: boolean;
  last4: string | null; // 저장된 키의 마지막 4자리 (확인용)
}

export interface ExposedApi {
  openDocuments: () => Promise<ImportResult>;
  importDocuments: (files: DroppedFile[]) => Promise<ImportResult>;
  listDocuments: () => Promise<DocSummary[]>;
  getDocument: (id: number) => Promise<DocDetail | null>;
  removeDocument: (id: number) => Promise<boolean>;
  secretStatus: () => Promise<SecretStatus>;
  saveSecret: (value: string) => Promise<{ ok: boolean; message?: string }>;
  clearSecret: () => Promise<void>;
  openDataFolder: () => void;
}
