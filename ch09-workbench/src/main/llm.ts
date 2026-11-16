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

export async function streamChat(
  config: LlmConfig,
  messages: ChatMessage[],
  onDelta: (delta: string) => void,
): Promise<StreamResult> {
  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({ model: config.model, messages, stream: true }),
  });
  if (!res.ok || !res.body) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`LLM 서버 오류 (HTTP ${res.status}) ${detail}`);
  }

  let text = '';
  let finishReason: string | null = null;
  const parser = createSseParser((data) => {
    if (data === '[DONE]') return;
    const json = JSON.parse(data) as {
      choices?: {
        delta?: { content?: string };
        finish_reason?: string | null;
      }[];
    };
    const choice = json.choices?.[0];
    const delta = choice?.delta?.content ?? '';
    if (delta) {
      text += delta;
      onDelta(delta);
    }
    if (choice?.finish_reason) finishReason = choice.finish_reason;
  });

  // 응답 본문을 조각 단위로 읽는다. 한글이 조각 경계에서 잘리지 않게 스트림 디코더를 쓴다
  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    parser.push(decoder.decode(chunk, { stream: true }));
  }
  parser.push(decoder.decode());
  parser.end();
  return { text, finishReason };
}
