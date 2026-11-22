import type { ExposedApi } from './shared/ipc';

// Chromium의 실험적 Prompt API 중 이 앱이 쓰는 부분만 선언한다 (11-4)
// https://github.com/webmachinelearning/prompt-api
interface PromptApiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface PromptApiSession {
  prompt(input: string, options?: { signal?: AbortSignal }): Promise<string>;
  promptStreaming(
    input: string,
    options?: { signal?: AbortSignal },
  ): ReadableStream<string>;
  readonly contextUsage: number;
  readonly contextWindow: number;
  destroy(): void;
}

interface PromptApi {
  availability(): Promise<
    'available' | 'downloadable' | 'downloading' | 'unavailable'
  >;
  create(options?: {
    initialPrompts?: PromptApiMessage[];
    signal?: AbortSignal;
  }): Promise<PromptApiSession>;
}

declare global {
  interface Window {
    api: ExposedApi;
    LanguageModel?: PromptApi; // 실험 기능이라 없을 수도 있다
  }
}
