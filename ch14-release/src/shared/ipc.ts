// Main과 Renderer가 함께 쓰는 IPC 채널 이름과 데이터 형식
import type { ChatMessage } from './chat';

export const IPC = {
  getSettings: 'settings:get',
  saveSettings: 'settings:save',
  secretStatus: 'secret:status',
  saveSecret: 'secret:save',
  clearSecret: 'secret:clear',
  // 대화 요청. Renderer가 만든 MessagePort 하나가 요청 하나다 (응답 조각과 취소가 이 포트로 오간다)
  startChat: 'chat:start',
  listLocalModels: 'local:list-models', // 11-3: Ollama에 설치된 대화 모델 목록
  enableLocalAi: 'local-ai:enable', // 12-1: Local AI Handler를 처음 필요할 때 시작
  reportError: 'log:renderer-error', // 12-4: 화면에서 난 오류를 Main 로그로
  openLogs: 'log:open-folder', // 12-4: 로그 폴더 열기
} as const;

// openai: 사용자가 자기 API 키로 직접 / proxy: 회사 중계 서버에 사용자 토큰으로 (11-2)
// ollama: 내 PC의 Ollama (11-3)
export type ProviderId = 'openai' | 'proxy' | 'ollama';
export const PROVIDER_IDS: ProviderId[] = ['openai', 'proxy', 'ollama'];

// 로컬 모델(Ollama) 옵션
export interface LocalOptions {
  numCtx: number; // 컨텍스트 크기(토큰). Ollama 기본값은 4096이고, 넘치면 앞부분을 조용히 버린다
  think: boolean; // 추론(thinking) 모델의 생각 단계를 켤지
}
export const NUM_CTX_CHOICES = [4096, 8192, 16384, 32768];

export interface ProviderSettings {
  baseUrl: string; // 비어 있으면 환경 변수 값을 쓴다
  model: string;
}

export interface LlmSettings {
  active: ProviderId;
  providers: Record<ProviderId, ProviderSettings>;
  local: LocalOptions;
}

export interface SettingsView {
  saved: LlmSettings;
  // 환경 변수(.env)에서 온 기본값. 키 값은 보내지 않고 있는지만 알린다
  defaults: Record<ProviderId, ProviderSettings & { hasKey: boolean }>;
  version: string; // 14-3: 앱 버전 (업데이트 확인, 문의 대응)
}

export interface SecretStatus {
  available: boolean; // OS 암호화를 쓸 수 있는가
  saved: boolean;
  last4: string | null;
  origin: string | null; // 이 키를 보낼 서버
}

export interface ChatRequest {
  provider: ProviderId;
  messages: ChatMessage[]; // user와 assistant만. 시스템 지시는 Main이 붙인다
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
}

// Main → Renderer (MessagePort로 오는 메시지)
export type ChatEvent =
  | { type: 'context'; dropped: number } // 길이 예산 때문에 보내지 않은 이전 메시지 수
  | { type: 'retry'; attempt: number; delayMs: number; reason: string } // 재시도 대기
  | { type: 'delta'; text: string } // 답변 조각
  | { type: 'reasoning'; text: string } // 추론(생각) 조각
  | { type: 'status'; text: string } // 진행 안내 (예: 모델을 불러오는 중)
  | {
      type: 'done';
      model: string;
      finishReason: string | null;
      usage: Usage | null;
      firstTokenMs: number | null; // 첫 조각까지 걸린 시간
      totalMs: number;
      tokensPerSec: number | null; // 생성 속도 (로컬 모델만 알려 준다)
    }
  | { type: 'error'; message: string };

// Renderer → Main (같은 포트로 보내는 메시지)
export type ChatControl = { type: 'cancel' };

export interface ChatHandle {
  cancel(): void;
}

export interface ExposedApi {
  getSettings(): Promise<SettingsView>;
  saveSettings(settings: LlmSettings): Promise<boolean>;
  secretStatus(provider: ProviderId): Promise<SecretStatus>;
  saveSecret(
    provider: ProviderId,
    value: string,
  ): Promise<{ ok: boolean; message?: string }>;
  clearSecret(provider: ProviderId): Promise<void>;
  chat(request: ChatRequest, onEvent: (event: ChatEvent) => void): ChatHandle;
  enableLocalAi(): Promise<void>;
  reportError(message: string): void;
  openLogs(): Promise<void>;
  listLocalModels(): Promise<
    { ok: true; models: string[] } | { ok: false; message: string }
  >;
}
