import type { WebContents } from 'electron';
import {
  IPC,
  type AnalyzeRequest,
  type AnalyzeResult,
  type LlmSettingsView,
} from '../shared/ipc';
import { buildMessages, type AnalysisKind } from '../shared/prompts';
import { addAnalysis, getDocument } from './store';
import { streamChat, type LlmConfig } from './llm';
import { loadApiKey } from './secrets';
import { getSettings } from './settings';

const env = (name: string) => process.env[name]?.trim() ?? '';

// 설정 화면에 저장한 값이 먼저, 비어 있으면 환경 변수(OPENAI_BASE_URL 등)
async function resolveConfig(): Promise<LlmConfig | string> {
  const { llm } = getSettings();
  const baseUrl = llm.baseUrl || env('OPENAI_BASE_URL');
  const model = llm.model || env('OPENAI_MODEL');
  if (!baseUrl) return 'LLM 서버 주소가 없습니다. 설정에서 입력하세요.';
  if (!model) return '모델 이름이 없습니다. 설정에서 입력하세요.';
  let apiKey = '';
  try {
    apiKey = (await loadApiKey()) ?? env('OPENAI_API_KEY');
  } catch {
    apiKey = env('OPENAI_API_KEY'); // 저장된 키를 복호화하지 못한 경우
  }
  return { baseUrl, model, apiKey };
}

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

export async function analyze(
  sender: WebContents,
  req: AnalyzeRequest,
): Promise<AnalyzeResult> {
  const doc = getDocument(req.docId);
  if (!doc) return { ok: false, message: '문서를 찾을 수 없습니다.' };
  if (doc.text.trim() === '') {
    return { ok: false, message: '분석할 글자가 없는 문서입니다.' };
  }
  const config = await resolveConfig();
  if (typeof config === 'string') return { ok: false, message: config };

  const prompt = buildMessages(req.kind, doc, req.question);
  const started = Date.now();
  try {
    const { text } = await streamChat(config, prompt.messages, (delta) => {
      // 창이 닫혔으면 보내지 않는다
      if (!sender.isDestroyed()) {
        sender.send(IPC.llmDelta, { requestId: req.requestId, delta });
      }
    });
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
    console.error('LLM 호출 실패', err);
    return { ok: false, message: (err as Error).message };
  }
}
