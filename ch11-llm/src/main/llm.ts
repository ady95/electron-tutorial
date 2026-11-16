// LLM 호출에서 공통으로 쓰는 형식과 오류
import type { Usage } from '../shared/ipc';

// 화면에 보여 줄 오류 종류. 서버가 보낸 원문은 로그에만 남긴다
export type LlmErrorCode =
  | 'network' // 서버에 연결하지 못함
  | 'auth' // 401·403: API 키 문제
  | 'not-found' // 404: 주소나 모델 이름이 틀림
  | 'rate-limit' // 429: 요청 한도·크레딧 초과
  | 'server' // 5xx
  | 'timeout' // 정해진 시간 동안 응답이 없음
  | 'canceled' // 사용자가 취소
  | 'bad-response' // 형식이 맞지 않는 응답
  | 'empty'; // 본문 없이 끝남 (길이 제한 등)

export class LlmError extends Error {
  constructor(
    readonly code: LlmErrorCode,
    readonly detail = '',
    readonly retryAfter: string | null = null, // 서버가 보낸 Retry-After 헤더
  ) {
    super(code);
  }
}

export function httpError(res: Response, detail: string) {
  const { status } = res;
  const retryAfter = res.headers.get('retry-after');
  if (status === 401 || status === 403) return new LlmError('auth', detail);
  if (status === 404) return new LlmError('not-found', detail);
  if (status === 429) return new LlmError('rate-limit', detail, retryAfter);
  if (status >= 500) return new LlmError('server', detail, retryAfter);
  return new LlmError('bad-response', `HTTP ${status} ${detail}`);
}

export interface StreamHandlers {
  onDelta(text: string): void; // 답변 조각
  onReasoning(text: string): void; // 추론 조각 (추론 모델만)
}

export interface StreamOptions {
  signal: AbortSignal; // 사용자가 취소하면 abort된다
  timeoutMs: number; // 응답 헤더까지, 그리고 조각과 조각 사이에 기다리는 최대 시간
}

export interface StreamResult {
  text: string;
  finishReason: string | null;
  usage: Usage | null;
}

// 사용자 취소와 시간 초과를 하나의 AbortController로 합친다.
// 조각이 올 때마다 arm()을 다시 불러 시간을 연장한다 (긴 응답도 끊기지 않게)
export function linkAbort({ signal, timeoutMs }: StreamOptions) {
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onCancel = () => controller.abort();
  signal.addEventListener('abort', onCancel);
  return {
    signal: controller.signal,
    arm() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
    },
    // fetch나 스트림 읽기에서 난 예외를 LlmError로 바꾼다
    toError(err: unknown): LlmError {
      if (err instanceof LlmError) return err;
      if (signal.aborted) return new LlmError('canceled');
      if (timedOut) return new LlmError('timeout');
      // fetch가 연결 단계에서 실패하면 TypeError('fetch failed')와 원인(cause)을 준다
      const cause = (err as { cause?: { code?: string } }).cause;
      return new LlmError('network', cause?.code ?? (err as Error).message);
    },
    dispose() {
      clearTimeout(timer);
      signal.removeEventListener('abort', onCancel);
    },
  };
}
