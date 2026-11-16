// Main과 Renderer가 함께 쓰는 IPC 채널 이름과 데이터 형식
import type { AnalysisKind } from './prompts';
export const IPC = {
  openDocuments: 'docs:open',
  importDocuments: 'docs:import',
  listDocuments: 'docs:list',
  getDocument: 'docs:get',
  removeDocument: 'docs:remove',
  getLlmSettings: 'llm:get-settings',
  saveLlmSettings: 'llm:save-settings',
  analyze: 'llm:analyze',
  cancelAnalysis: 'llm:cancel',
  listAnalyses: 'analyses:list',
  search: 'search:query',
  llmDelta: 'llm:delta',
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
  suspicious: string[]; // AI에게 내리는 지시처럼 보이는 줄 (프롬프트 주입 의심)
}

// 드래그 앤 드롭으로 받은 파일. 경로 대신 이름과 내용을 보낸다
export interface DroppedFile {
  name: string;
  data: Uint8Array;
}

export interface ImportResult {
  added: DocSummary[];
  duplicates: string[]; // 이미 있는 문서라 다시 저장하지 않은 파일 이름
  errors: { name: string; message: string }[];
}

// LLM 연결 설정. API 키는 여기에 넣지 않는다 (safeStorage에 따로 저장)
export interface LlmSettings {
  baseUrl: string;
  model: string;
}

// 설정 화면에 보여 줄 정보. 환경 변수는 값이 아니라 "설정되어 있는지"만 알린다
export interface LlmSettingsView {
  saved: LlmSettings;
  fromEnv: { baseUrl: boolean; model: boolean; apiKey: boolean };
}

export interface AnalyzeRequest {
  requestId: number; // 스트리밍 조각이 어느 요청의 것인지 구분한다
  docId: number;
  kind: AnalysisKind;
  question: string; // kind가 qa일 때만
}

export type AnalyzeResult =
  | {
      ok: true;
      analysisId: number;
      text: string;
      model: string;
      sentChars: number;
      clipped: boolean;
      elapsedMs: number;
    }
  | { ok: false; message: string };

// 저장된 분석 결과
export interface AnalysisRecord {
  id: number;
  docId: number;
  kind: AnalysisKind;
  question: string;
  model: string;
  result: string;
  sentChars: number;
  clipped: boolean;
  elapsedMs: number;
  createdAt: string;
}

// 검색 결과 한 줄. 문서 자체(이름·본문)에서 찾았는지, 분석 결과에서 찾았는지 구분한다
export interface SearchHit {
  source: 'doc' | 'analysis';
  refId: number; // 문서 id 또는 분석 id
  docId: number;
  docName: string;
  title: string;
  snippet: string;
}

export interface LlmDelta {
  requestId: number;
  delta: string;
}

export interface SecretStatus {
  available: boolean; // OS 암호화 사용 가능 여부
  saved: boolean;
  last4: string | null; // 저장된 키의 마지막 4자리 (확인용)
  origin: string | null; // 키를 보낼 서버 (저장할 때의 서버 주소)
}

export interface ExposedApi {
  openDocuments: () => Promise<ImportResult>;
  importDocuments: (files: DroppedFile[]) => Promise<ImportResult>;
  listDocuments: () => Promise<DocSummary[]>;
  getDocument: (id: number) => Promise<DocDetail | null>;
  removeDocument: (id: number) => Promise<boolean>;
  getLlmSettings: () => Promise<LlmSettingsView>;
  saveLlmSettings: (settings: LlmSettings) => Promise<boolean>;
  analyze: (request: AnalyzeRequest) => Promise<AnalyzeResult>;
  cancelAnalysis: (requestId: number) => void;
  onLlmDelta: (callback: (d: LlmDelta) => void) => () => void;
  listAnalyses: (docId: number) => Promise<AnalysisRecord[]>;
  search: (query: string) => Promise<SearchHit[]>;
  secretStatus: () => Promise<SecretStatus>;
  saveSecret: (value: string) => Promise<{ ok: boolean; message?: string }>;
  clearSecret: () => Promise<void>;
  openDataFolder: () => void;
}
