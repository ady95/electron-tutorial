import type { WebContents } from 'electron';
import {
  IPC,
  type AnalyzeRequest,
  type AnalyzeResult,
  type ConnectionTestResult,
  type LlmSettingsView,
} from '../shared/ipc';
import { buildMessages, type AnalysisKind } from '../shared/prompts';
import { LlmError, streamChat, type LlmConfig, type LlmErrorCode } from './llm';
import { loadApiKey } from './secrets';
import { getSettings } from './settings';
import { addAnalysis, getDocument } from './store';

const env = (name: string) => process.env[name]?.trim() ?? '';

// 응답이 없을 때 기다리는 시간. 개발 중 테스트를 위해서만 바꿀 수 있다
let timeoutMs = 60_000;
export function setTimeoutForDev(ms: number) {
  if (ms > 0) timeoutMs = ms;
}

export const originOf = (baseUrl: string) => {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return '';
  }
};

// 지금 쓸 서버 주소. 설정 화면에 저장한 값이 먼저, 비어 있으면 환경 변수
export function currentBaseUrl() {
  return getSettings().llm.baseUrl || env('OPENAI_BASE_URL');
}

// API 키는 "그 키를 받기로 한 서버"에만 보낸다
//  - 설정 화면에 저장한 키: 저장할 때의 서버 주소(origin)와 지금 주소가 같을 때만
//  - 환경 변수의 키: 서버 주소도 환경 변수에서 왔을 때만
async function resolveConfig(): Promise<LlmConfig | string> {
  const { llm } = getSettings();
  const baseUrl = currentBaseUrl();
  const model = llm.model || env('OPENAI_MODEL');
  if (!baseUrl) return 'LLM 서버 주소가 없습니다. 설정에서 입력하세요.';
  if (!model) return '모델 이름이 없습니다. 설정에서 입력하세요.';
  const origin = originOf(baseUrl);

  let saved: { key: string; origin: string } | null = null;
  try {
    saved = await loadApiKey();
  } catch {
    saved = null; // 복호화할 수 없는 키 (다른 PC에서 가져온 파일 등)
  }
  let apiKey = '';
  if (saved) {
    if (saved.origin !== origin) {
      return `저장된 API 키는 ${saved.origin}용입니다. 지금 서버(${origin})에 쓰려면 설정에서 키를 다시 저장하세요.`;
    }
    apiKey = saved.key;
  } else if (!llm.baseUrl) {
    apiKey = env('OPENAI_API_KEY');
  }
  return { baseUrl, model, apiKey };
}

// 사용자에게 보여 줄 문장. 서버가 보낸 원문(키 일부가 들어 있을 수도 있다)은 화면에 내보내지 않는다
const MESSAGES: Record<LlmErrorCode, string> = {
  network: 'LLM 서버에 연결하지 못했습니다. 서버 주소와 네트워크를 확인하세요.',
  auth: 'API 키가 올바르지 않거나 권한이 없습니다. 설정에서 키를 확인하세요.',
  'not-found': '서버 주소나 모델 이름을 찾을 수 없습니다. 설정을 확인하세요.',
  'rate-limit':
    '요청 한도를 넘었습니다. 잠시 뒤 다시 시도하거나 사용량·결제 상태를 확인하세요.',
  server: 'LLM 서버에 문제가 생겼습니다. 잠시 뒤 다시 시도하세요.',
  timeout: '응답이 너무 오래 없어 중단했습니다. 잠시 뒤 다시 시도하세요.',
  canceled: '취소했습니다.',
  'bad-response':
    'LLM 서버의 응답 형식을 이해하지 못했습니다. OpenAI 호환 서버인지 확인하세요.',
  empty:
    '모델이 답변 본문을 보내지 않았습니다. 추론(thinking) 모델이라면 답변 전에 길이 제한에 걸렸을 수 있습니다.',
};

export function getLlmSettingsView(): LlmSettingsView {
  return {
    saved: getSettings().llm,
    fromEnv: {
      baseUrl: env('OPENAI_BASE_URL') !== '',
      model: env('OPENAI_MODEL') !== '',
      apiKey: env('OPENAI_API_KEY') !== '',
    },
  };
}

const KINDS: AnalysisKind[] = ['summary', 'keywords', 'qa'];

// Renderer에서 온 요청을 검사한다
export function parseAnalyzeRequest(value: unknown): AnalyzeRequest | null {
  const v = (value ?? {}) as Record<string, unknown>;
  const int = (n: unknown) =>
    typeof n === 'number' && Number.isInteger(n) && n > 0;
  if (!int(v.requestId) || !int(v.docId)) return null;
  if (!KINDS.includes(v.kind as AnalysisKind)) return null;
  const question = typeof v.question === 'string' ? v.question.trim() : '';
  if (question.length > 500) return null;
  if (v.kind === 'qa' && question === '') return null;
  return {
    requestId: v.requestId as number,
    docId: v.docId as number,
    kind: v.kind as AnalysisKind,
    question,
  };
}

// 창(webContents)마다 진행 중인 요청 하나를 기억한다. 취소와 창 닫힘에 쓴다
const running = new Map<
  number,
  { requestId: number; controller: AbortController }
>();

export function cancelAnalysis(sender: WebContents, requestId: unknown) {
  const job = running.get(sender.id);
  if (job && job.requestId === requestId) job.controller.abort();
}

export async function analyze(
  sender: WebContents,
  req: AnalyzeRequest,
): Promise<AnalyzeResult> {
  if (running.has(sender.id)) {
    return {
      ok: false,
      message: '이미 분석 중입니다. 끝나거나 취소한 뒤 다시 시도하세요.',
    };
  }
  const doc = getDocument(req.docId);
  if (!doc) return { ok: false, message: '문서를 찾을 수 없습니다.' };
  if (doc.text.trim() === '') {
    return { ok: false, message: '분석할 글자가 없는 문서입니다.' };
  }
  // "분석 중" 표시는 첫 await보다 먼저 한다.
  // await 뒤에 하면, 기다리는 사이에 들어온 두 번째 요청도 위의 검사를 통과한다
  const controller = new AbortController();
  const senderId = sender.id;
  running.set(senderId, { requestId: req.requestId, controller });
  // 분석 중에 창이 닫히면 요청도 끊는다 (응답을 받을 곳이 없다)
  const onGone = () => controller.abort();
  sender.once('destroyed', onGone);

  const started = Date.now();
  try {
    const config = await resolveConfig();
    if (typeof config === 'string') return { ok: false, message: config };
    const prompt = buildMessages(req.kind, doc, req.question);
    const { text } = await streamChat(
      config,
      prompt.messages,
      (delta) => {
        if (!sender.isDestroyed()) {
          sender.send(IPC.llmDelta, { requestId: req.requestId, delta });
        }
      },
      { signal: controller.signal, timeoutMs },
    );
    const elapsedMs = Date.now() - started;
    // 결과를 저장한다. 저장에 실패해도 화면에는 결과를 보여 준다
    let analysisId = 0;
    try {
      analysisId = addAnalysis({
        docId: doc.id,
        kind: req.kind,
        question: req.question,
        model: config.model,
        result: text,
        sentChars: prompt.sentChars,
        clipped: prompt.clipped,
        elapsedMs,
      });
    } catch (err) {
      console.error('분석 결과 저장 실패', err);
    }
    return {
      ok: true,
      analysisId,
      text,
      model: config.model,
      sentChars: prompt.sentChars,
      clipped: prompt.clipped,
      elapsedMs,
    };
  } catch (err) {
    const code = err instanceof LlmError ? err.code : 'network';
    // 자세한 내용은 개발자용 로그에만 남긴다
    console.error(
      `[LLM] ${code} (${Date.now() - started}ms)`,
      err instanceof LlmError ? err.detail : err,
    );
    return { ok: false, message: MESSAGES[code] };
  } finally {
    running.delete(senderId);
    if (!sender.isDestroyed()) sender.off('destroyed', onGone);
  }
}

// 설정 화면의 [연결 테스트]. 아주 짧은 요청을 보내 설정이 맞는지 확인한다
export async function testConnection(): Promise<ConnectionTestResult> {
  const config = await resolveConfig();
  if (typeof config === 'string') return { ok: false, message: config };
  const started = Date.now();
  try {
    const { text } = await streamChat(
      config,
      [{ role: 'user', content: '연결 확인입니다. "OK"라고만 답하세요.' }],
      () => {},
      {
        signal: new AbortController().signal,
        timeoutMs: Math.min(timeoutMs, 20_000),
      },
    );
    return {
      ok: true,
      message: `연결되었습니다. 모델 ${config.model}, ${((Date.now() - started) / 1000).toFixed(1)}초, 응답: ${text.trim().slice(0, 20)}`,
    };
  } catch (err) {
    const code = err instanceof LlmError ? err.code : 'network';
    console.error(
      `[LLM] test ${code}`,
      err instanceof LlmError ? err.detail : err,
    );
    return { ok: false, message: MESSAGES[code] };
  }
}
