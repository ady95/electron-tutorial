// 대화 요청 하나를 처리한다. 요청마다 MessagePort 하나를 쓴다:
// Main → Renderer: 응답 조각·재시도 안내·완료·오류 / Renderer → Main: 취소
import type { MessagePortMain } from 'electron';
import { setTimeout as sleep } from 'node:timers/promises';
import { fitHistory, type ChatMessage } from '../shared/chat';
import {
  PROVIDER_IDS,
  type ChatEvent,
  type ChatRequest,
  type ProviderId,
} from '../shared/ipc';
import { parseRetryAfter, retryDelay } from '../shared/retry';
import { LlmError, type LlmErrorCode, type StreamHandlers } from './llm';
import { streamOpenAi } from './openai';
import { resolveProvider } from './providers';

const SYSTEM_PROMPT =
  '당신은 데스크톱 앱 안의 도우미입니다. 한국어로 간결하게 답하고, 필요하면 마크다운을 씁니다.';

// 한 번에 보낼 대화의 최대 글자 수. 넘으면 오래된 대화부터 보내지 않는다
const HISTORY_BUDGET_CHARS = 24_000;
const MAX_RETRIES = 2; // 첫 시도 뒤 최대 두 번 더
const MAX_RETRY_WAIT_MS = 20_000; // 이보다 오래 기다리라고 하면 재시도하지 않고 알린다
const RETRYABLE: LlmErrorCode[] = ['rate-limit', 'server'];

// 응답이 없을 때 기다리는 시간. 개발 중 테스트를 위해서만 바꿀 수 있다
let timeoutMs = 60_000;
export function setTimeoutForDev(ms: number) {
  if (ms > 0) timeoutMs = ms;
}

// 사용자에게 보여 줄 문장. 서버가 보낸 원문(키 일부가 들어 있을 수도 있다)은 화면에 내보내지 않는다
const MESSAGES: Record<LlmErrorCode, string> = {
  network: 'LLM 서버에 연결하지 못했습니다. 서버 주소와 네트워크를 확인하세요.',
  auth: 'API 키(또는 사용자 토큰)가 올바르지 않거나 권한이 없습니다. 설정에서 확인하세요.',
  'not-found': '서버 주소나 모델 이름을 찾을 수 없습니다. 설정을 확인하세요.',
  'rate-limit':
    '요청 한도를 넘었습니다. 잠시 뒤 다시 시도하거나 사용량·결제 상태를 확인하세요.',
  server: 'LLM 서버에 문제가 생겼습니다. 잠시 뒤 다시 시도하세요.',
  timeout: '응답이 너무 오래 없어 중단했습니다. 잠시 뒤 다시 시도하세요.',
  canceled: '중지했습니다.',
  'bad-response':
    'LLM 서버의 응답 형식을 이해하지 못했습니다. OpenAI 호환 서버인지 확인하세요.',
  empty:
    '모델이 답변 본문을 보내지 않았습니다. 추론(thinking) 모델이라면 답변 전에 길이 제한에 걸렸을 수 있습니다.',
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

// Renderer에서 온 요청을 검사한다
export function parseChatRequest(value: unknown): ChatRequest | null {
  if (!isObject(value) || !Array.isArray(value.messages)) return null;
  if (!PROVIDER_IDS.includes(value.provider as ProviderId)) return null;
  if (value.messages.length === 0 || value.messages.length > 200) return null;
  const messages: ChatMessage[] = [];
  for (const m of value.messages) {
    if (!isObject(m) || typeof m.content !== 'string') return null;
    if (m.role !== 'user' && m.role !== 'assistant') return null; // system은 받지 않는다
    if (m.content.length > 100_000) return null;
    messages.push({ role: m.role, content: m.content });
  }
  return { provider: value.provider as ProviderId, messages };
}

export function startChat(port: MessagePortMain, value: unknown) {
  const post = (event: ChatEvent) => port.postMessage(event);
  const req = parseChatRequest(value);
  if (!req) {
    post({ type: 'error', message: '잘못된 요청입니다.' });
    port.close();
    return;
  }
  const controller = new AbortController();
  port.on('message', ({ data }) => {
    if (isObject(data) && data.type === 'cancel') controller.abort();
  });
  // 창을 닫거나 새로고침하면 포트가 닫힌다. 받을 곳이 없으니 요청도 끊는다
  port.on('close', () => controller.abort());
  port.start();
  void run(req, post, controller.signal).finally(() => port.close());
}

async function run(
  req: ChatRequest,
  post: (event: ChatEvent) => void,
  signal: AbortSignal,
) {
  const started = Date.now();
  const provider = await resolveProvider(req.provider);
  if (typeof provider === 'string') {
    return post({ type: 'error', message: provider });
  }
  const fit = fitHistory(SYSTEM_PROMPT, req.messages, HISTORY_BUDGET_CHARS);
  if (!fit) {
    return post({
      type: 'error',
      message: `메시지가 너무 깁니다. ${HISTORY_BUDGET_CHARS.toLocaleString()}자 이내로 줄여 주세요.`,
    });
  }
  if (fit.dropped > 0) post({ type: 'context', dropped: fit.dropped });

  let firstTokenMs: number | null = null;
  const mark = () => {
    firstTokenMs ??= Date.now() - started;
  };
  const handlers: StreamHandlers = {
    onDelta: (text) => {
      mark();
      post({ type: 'delta', text });
    },
    onReasoning: (text) => {
      mark();
      post({ type: 'reasoning', text });
    },
  };

  for (let attempt = 1; ; attempt++) {
    try {
      const result = await streamOpenAi(provider, fit.messages, handlers, {
        signal,
        timeoutMs,
      });
      return post({
        type: 'done',
        model: provider.model,
        finishReason: result.finishReason,
        usage: result.usage,
        firstTokenMs,
        totalMs: Date.now() - started,
      });
    } catch (err) {
      const e =
        err instanceof LlmError ? err : new LlmError('network', String(err));
      // 자세한 내용은 개발자용 로그에만 남긴다
      console.error(`[LLM] ${e.code} (시도 ${attempt})`, e.detail);
      // 이미 화면에 글자가 나왔다면 재시도하지 않는다 (같은 답이 두 번 이어 붙는다)
      const canRetry =
        attempt <= MAX_RETRIES &&
        firstTokenMs === null &&
        RETRYABLE.includes(e.code);
      if (!canRetry) return post({ type: 'error', message: MESSAGES[e.code] });
      const delayMs = retryDelay(attempt, parseRetryAfter(e.retryAfter));
      if (delayMs > MAX_RETRY_WAIT_MS) {
        return post({
          type: 'error',
          message: `${MESSAGES[e.code]} (서버가 ${Math.ceil(delayMs / 1000)}초 뒤에 다시 시도하라고 합니다)`,
        });
      }
      post({ type: 'retry', attempt, delayMs, reason: e.code });
      try {
        await sleep(delayMs, undefined, { signal });
      } catch {
        return post({ type: 'error', message: MESSAGES.canceled });
      }
    }
  }
}
