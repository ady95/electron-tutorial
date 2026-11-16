// OpenAI 호환 Chat Completions API를 fetch로 부른다 (SDK 없이).
// OpenAI, 로컬 Ollama(http://localhost:11434/v1) 등 같은 형식을 쓰는 서버라면 어디든 된다.
import type { ChatMessage } from '../shared/prompts';
import { createSseParser } from '../shared/sse';

export interface LlmConfig {
  baseUrl: string; // 예: https://api.openai.com/v1
  apiKey: string; // 로컬 서버라면 빈 문자열이어도 된다
  model: string;
}

export interface StreamResult {
  text: string;
  finishReason: string | null;
}

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
  ) {
    super(code);
  }
}

export interface StreamOptions {
  signal: AbortSignal; // 사용자가 취소하면 abort된다
  timeoutMs: number; // 응답 헤더까지, 그리고 조각과 조각 사이에 기다리는 최대 시간
}

function httpError(status: number, detail: string) {
  if (status === 401 || status === 403) return new LlmError('auth', detail);
  if (status === 404) return new LlmError('not-found', detail);
  if (status === 429) return new LlmError('rate-limit', detail);
  if (status >= 500) return new LlmError('server', detail);
  return new LlmError('bad-response', `HTTP ${status} ${detail}`);
}

export async function streamChat(
  config: LlmConfig,
  messages: ChatMessage[],
  onDelta: (delta: string) => void,
  { signal, timeoutMs }: StreamOptions,
): Promise<StreamResult> {
  // 사용자 취소와 시간 초과를 하나의 AbortController로 합친다
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const armTimer = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  };
  const onCancel = () => controller.abort();
  signal.addEventListener('abort', onCancel);

  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  let text = '';
  let finishReason: string | null = null;
  try {
    armTimer();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: config.model, messages, stream: true }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      throw httpError(res.status, detail);
    }

    const parser = createSseParser((data) => {
      if (data === '[DONE]') return;
      let json: {
        choices?: {
          delta?: { content?: string };
          finish_reason?: string | null;
        }[];
      };
      try {
        json = JSON.parse(data);
      } catch {
        throw new LlmError('bad-response', data.slice(0, 200));
      }
      const choice = json.choices?.[0];
      const delta = choice?.delta?.content ?? '';
      if (delta) {
        text += delta;
        onDelta(delta);
      }
      if (choice?.finish_reason) finishReason = choice.finish_reason;
    });

    const decoder = new TextDecoder();
    for await (const chunk of res.body) {
      armTimer(); // 조각이 올 때마다 시간 제한을 다시 건다 (추론 모델의 긴 응답도 끊지 않도록)
      parser.push(decoder.decode(chunk, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.end();
  } catch (err) {
    if (err instanceof LlmError) throw err;
    if (signal.aborted) throw new LlmError('canceled');
    if (timedOut) throw new LlmError('timeout');
    // fetch가 연결 단계에서 실패하면 TypeError('fetch failed')와 원인(cause)을 준다
    const cause = (err as { cause?: { code?: string } }).cause;
    throw new LlmError('network', cause?.code ?? (err as Error).message);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onCancel);
  }
  if (text.trim() === '')
    throw new LlmError('empty', `finish_reason=${finishReason}`);
  return { text, finishReason };
}
