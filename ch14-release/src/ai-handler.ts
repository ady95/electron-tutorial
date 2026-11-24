// Local AI Handler (11-4, 실험 기능). UtilityProcess에서 실행된다.
// 화면이 웹 표준 Prompt API(LanguageModel)를 부르면, Electron이 그 요청을 이 프로세스로 보낸다.
// 여기서는 그 요청을 내 PC의 Ollama로 넘긴다
import { LanguageModelUtility, localAIHandler } from 'electron/utility';
import { ReadableStream } from 'node:stream/web';
import type { ChatMessage } from './shared/chat';
import { estimateTokens } from './shared/tokens';
import { ollamaRoot, streamOllama, type OllamaConfig } from './main/ollama';

// Main이 보내 주는 설정. 받기 전에는 모든 요청을 거부한다
export interface LocalAiConfig {
  baseUrl: string;
  model: string;
  numCtx: number;
  appOrigin: string; // 이 출처의 페이지만 허용한다 (예: http://localhost:5173, file://)
}
let config: LocalAiConfig | null = null;
// Main과의 통신 창구는 process.parentPort다. ('electron/utility'의 parentPort는 실측에서 undefined였다)
process.parentPort.on('message', ({ data }) => {
  config = data as LocalAiConfig;
  console.log(
    `[Local AI] 설정 받음: 모델 ${config.model}, 허용 출처 ${config.appOrigin}`,
  );
});

type PromptMessage = Parameters<LanguageModelUtility['prompt']>[0][number];

// Prompt API의 메시지(내용이 조각 배열)를 대화 메시지로 바꾼다. 글자가 아닌 입력(이미지·소리)은 받지 않는다
function toChat(input: PromptMessage[]): ChatMessage[] {
  return input.map((m) => {
    if (m.content.some((c) => c.type !== 'text')) {
      throw new DOMException('글자 입력만 지원합니다.', 'NotSupportedError');
    }
    return {
      role: m.role,
      content: m.content.map((c) => String(c.value)).join(''),
    };
  });
}

// 렌더러가 Prompt API를 처음 쓸 때(창·출처마다 한 번) 불린다.
// 클래스를 돌려주면 허용, null이면 거부. 같은 세션의 다른 출처 페이지도 여기까지 온다 (11-4 실측)
localAIHandler.setPromptAPIHandler((details) => {
  if (!config || details.securityOrigin !== config.appOrigin) {
    console.warn(`[Local AI] 거부: ${details.securityOrigin}`);
    return null;
  }
  // 이 함수는 창·출처마다 한 번만 불린다. 설정은 복사해 두지 말고 쓸 때마다 읽는다
  // (복사해 두면 설정 화면에서 모델·주소를 바꿔도 이미 연결된 화면에는 반영되지 않는다)
  const cfg = (): OllamaConfig => ({ ...config!, think: false });

  return class OllamaLanguageModel extends LanguageModelUtility {
    // 이 세션의 대화. Prompt API의 세션은 이전 대화를 기억해야 한다
    history: ChatMessage[] = [];
    // destroy()가 불리면 진행 중인 요청도 끊는다
    readonly destroyed = new AbortController();

    static async availability() {
      try {
        const res = await fetch(`${ollamaRoot(cfg().baseUrl)}/api/tags`, {
          signal: AbortSignal.timeout(3000),
        });
        const tags = (await res.json()) as { models?: { name: string }[] };
        const found = tags.models?.some((m) => m.name === cfg().model);
        return found ? 'available' : 'unavailable';
      } catch {
        return 'unavailable'; // Ollama가 꺼져 있다
      }
    }

    static async create(
      options: Parameters<typeof LanguageModelUtility.create>[0],
    ) {
      const model = new OllamaLanguageModel({
        contextUsage: 0,
        contextWindow: cfg().numCtx,
      });
      model.history = toChat(options.initialPrompts ?? []);
      return model;
    }

    async prompt(
      input: PromptMessage[],
      options: Parameters<LanguageModelUtility['prompt']>[1],
    ) {
      const asked = toChat(input);
      const signal = AbortSignal.any([options.signal, this.destroyed.signal]);
      // 조각을 받는 대로 흘려보내는 스트림을 돌려준다 (promptStreaming()이 이것을 그대로 받는다)
      return new ReadableStream<string>({
        start: (controller) => {
          streamOllama(
            cfg(),
            [...this.history, ...asked],
            {
              onDelta: (text) => controller.enqueue(text),
              onReasoning: () => {},
            },
            { signal, timeoutMs: 120_000 },
          )
            .then((result) => {
              this.history.push(...asked, {
                role: 'assistant',
                content: result.text,
              });
              if (result.usage) {
                this.contextUsage =
                  result.usage.promptTokens + result.usage.completionTokens;
              }
              controller.close();
            })
            .catch((err: unknown) => {
              console.error('[Local AI] 실패', (err as Error).message);
              controller.error(err);
            });
        },
      });
    }

    async append(input: PromptMessage[]) {
      this.history.push(...toChat(input));
      return undefined;
    }

    async measureContextUsage(input: PromptMessage[]) {
      return toChat(input).reduce((n, m) => n + estimateTokens(m.content), 0);
    }

    async clone() {
      const copy = new OllamaLanguageModel({
        contextUsage: this.contextUsage,
        contextWindow: this.contextWindow,
      });
      copy.history = [...this.history];
      return copy;
    }

    destroy() {
      this.destroyed.abort();
    }
  };
});

console.log('[Local AI] 핸들러 등록');
