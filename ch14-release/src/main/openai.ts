// OpenAI 호환 Chat Completions API를 fetch로 부른다 (SDK 없이).
// 9장의 llm.ts에 사용량(usage)과 추론 조각 처리를 더했다
import type { ChatMessage } from '../shared/chat';
import { createSseParser } from '../shared/sse';
import {
  LlmError,
  httpError,
  linkAbort,
  type StreamHandlers,
  type StreamOptions,
  type StreamResult,
} from './llm';

export interface OpenAiConfig {
  baseUrl: string; // 예: https://api.openai.com/v1
  apiKey: string;
  model: string;
}

interface Chunk {
  choices?: {
    delta?: {
      content?: string;
      reasoning?: string;
      reasoning_content?: string;
    };
    finish_reason?: string | null;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
}

export async function streamOpenAi(
  config: OpenAiConfig,
  messages: ChatMessage[],
  handlers: StreamHandlers,
  options: StreamOptions,
): Promise<StreamResult> {
  const link = linkAbort(options);
  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const result: StreamResult = { text: '', finishReason: null, usage: null };
  try {
    link.arm();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: true,
        // 마지막 조각에 토큰 사용량을 붙여 달라고 요청한다
        stream_options: { include_usage: true },
      }),
      signal: link.signal,
    });
    if (!res.ok || !res.body) {
      throw httpError(res, (await res.text().catch(() => '')).slice(0, 300));
    }

    const parser = createSseParser((data) => {
      if (data === '[DONE]') return;
      let json: Chunk;
      try {
        json = JSON.parse(data) as Chunk;
      } catch {
        throw new LlmError('bad-response', data.slice(0, 200));
      }
      const choice = json.choices?.[0];
      // 추론 내용의 필드 이름은 서버마다 다르다 (Ollama는 reasoning, 일부 서버는 reasoning_content)
      const reasoning =
        choice?.delta?.reasoning ?? choice?.delta?.reasoning_content ?? '';
      if (reasoning) handlers.onReasoning(reasoning);
      const delta = choice?.delta?.content ?? '';
      if (delta) {
        result.text += delta;
        handlers.onDelta(delta);
      }
      if (choice?.finish_reason) result.finishReason = choice.finish_reason;
      if (json.usage) {
        result.usage = {
          promptTokens: json.usage.prompt_tokens ?? 0,
          completionTokens: json.usage.completion_tokens ?? 0,
        };
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
    throw link.toError(err);
  } finally {
    link.dispose();
  }
  if (result.text.trim() === '') {
    throw new LlmError('empty', `finish_reason=${result.finishReason}`);
  }
  return result;
}
