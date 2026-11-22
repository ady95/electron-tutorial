// 내 PC의 Ollama를 고유 API(/api/chat)로 부른다 (11-3).
// OpenAI 호환 주소(/v1)도 있지만, 컨텍스트 크기(num_ctx)와 추론 끄기(think)를 정확히 지정하려고 고유 API를 쓴다
import type { ChatMessage } from '../shared/chat';
import { createNdjsonParser } from '../shared/ndjson';
import {
  LlmError,
  httpError,
  linkAbort,
  type StreamHandlers,
  type StreamOptions,
  type StreamResult,
} from './llm';

export interface OllamaConfig {
  baseUrl: string; // 예: http://localhost:11434
  model: string;
  numCtx: number;
  think: boolean;
}

// OpenAI 호환 주소(…/v1)를 넣어도 고유 API 주소로 바꿔 쓴다
export const ollamaRoot = (baseUrl: string) =>
  baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '');

interface ChatChunk {
  message?: { content?: string; thinking?: string };
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  eval_duration?: number; // 나노초
  error?: string;
}

type OllamaResult = StreamResult & { tokensPerSec: number | null };

export async function streamOllama(
  config: OllamaConfig,
  messages: ChatMessage[],
  handlers: StreamHandlers,
  options: StreamOptions,
): Promise<OllamaResult> {
  const link = linkAbort(options);
  const result: OllamaResult = {
    text: '',
    finishReason: null,
    usage: null,
    tokensPerSec: null,
  };
  try {
    link.arm();
    const res = await fetch(`${ollamaRoot(config.baseUrl)}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: true,
        think: config.think,
        options: { num_ctx: config.numCtx },
      }),
      signal: link.signal,
    });
    if (!res.ok || !res.body) {
      throw httpError(res, (await res.text().catch(() => '')).slice(0, 300));
    }
    const parser = createNdjsonParser((value) => {
      const chunk = value as ChatChunk;
      if (chunk.error) throw new LlmError('server', chunk.error);
      const thinking = chunk.message?.thinking ?? '';
      if (thinking) handlers.onReasoning(thinking);
      const content = chunk.message?.content ?? '';
      if (content) {
        result.text += content;
        handlers.onDelta(content);
      }
      if (chunk.done) {
        result.finishReason = chunk.done_reason ?? null;
        result.usage = {
          promptTokens: chunk.prompt_eval_count ?? 0,
          completionTokens: chunk.eval_count ?? 0,
        };
        if (chunk.eval_count && chunk.eval_duration) {
          result.tokensPerSec = chunk.eval_count / (chunk.eval_duration / 1e9);
        }
      }
    });
    const decoder = new TextDecoder();
    for await (const chunk of res.body) {
      link.arm();
      parser.push(decoder.decode(chunk, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.end();
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new LlmError('bad-response', err.message);
    }
    throw link.toError(err);
  } finally {
    link.dispose();
  }
  if (result.text.trim() === '') {
    throw new LlmError('empty', `done_reason=${result.finishReason}`);
  }
  return result;
}

const getJson = async (url: string, init?: RequestInit) => {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw httpError(res, '');
  return res.json() as Promise<unknown>;
};

// 설치된 모델 중 대화할 수 있는 것만 (임베딩 모델은 뺀다)
export async function listChatModels(baseUrl: string): Promise<string[]> {
  const root = ollamaRoot(baseUrl);
  const tags = (await getJson(`${root}/api/tags`)) as {
    models?: { name: string }[];
  };
  const names = (tags.models ?? []).map((m) => m.name);
  const checked = await Promise.all(
    names.map(async (model) => {
      const show = (await getJson(`${root}/api/show`, {
        method: 'POST',
        body: JSON.stringify({ model }),
      })) as { capabilities?: string[] };
      return show.capabilities?.includes('completion') ? model : null;
    }),
  );
  return checked.filter((m): m is string => m !== null);
}

// 모델이 이미 메모리에 올라와 있는가. 아니면 첫 응답 전에 불러오는 시간이 걸린다
export async function isLoaded(config: OllamaConfig): Promise<boolean> {
  try {
    const ps = (await getJson(`${ollamaRoot(config.baseUrl)}/api/ps`)) as {
      models?: { name: string; context_length?: number }[];
    };
    // 컨텍스트 크기가 다르면 Ollama가 모델을 다시 불러온다
    return (ps.models ?? []).some(
      (m) => m.name === config.model && m.context_length === config.numCtx,
    );
  } catch {
    return false;
  }
}
