// streamOpenAi 단위 테스트 (12-2). 진짜 서버 대신 fetch를 가짜로 바꾼다
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LlmError } from './llm';
import { streamOpenAi } from './openai';

const config = {
  baseUrl: 'https://llm.example.com/v1',
  apiKey: 'k',
  model: 'm',
};
const encoder = new TextEncoder();

// 주어진 바이트 조각을 차례로 내보내는 응답
function sseResponse(chunks: (string | Uint8Array)[]) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) {
        controller.enqueue(typeof c === 'string' ? encoder.encode(c) : c);
      }
      controller.close();
    },
  });
  return new Response(body, {
    headers: { 'content-type': 'text/event-stream' },
  });
}

// 아무것도 보내지 않고 기다리다가, 요청이 abort되면 오류로 끝나는 응답
function hangingFetch() {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        init.signal?.addEventListener('abort', () =>
          controller.error(new DOMException('aborted', 'AbortError')),
        );
      },
    });
    return new Response(body);
  });
}

const delta = (content: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

function run(signal = new AbortController().signal, timeoutMs = 5000) {
  const deltas: string[] = [];
  const promise = streamOpenAi(
    config,
    [{ role: 'user', content: '안녕' }],
    { onDelta: (t) => deltas.push(t), onReasoning: () => {} },
    { signal, timeoutMs },
  );
  return { deltas, promise };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('streamOpenAi', () => {
  it('SSE 줄이 조각 중간에서 끊겨도 순서대로 합친다', async () => {
    const first = delta('안');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse([
          first.slice(0, 10),
          first.slice(10) + delta('녕'),
          'data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2}}\n\ndata: [DONE]\n\n',
        ]),
      ),
    );
    const { deltas, promise } = run();
    const result = await promise;
    expect(deltas).toEqual(['안', '녕']);
    expect(result.text).toBe('안녕');
    expect(result.usage).toEqual({ promptTokens: 3, completionTokens: 2 });
  });

  it('한글 한 글자의 UTF-8 바이트가 두 조각으로 나뉘어도 깨지지 않는다', async () => {
    const bytes = encoder.encode(delta('한글'));
    const cut = bytes.indexOf(0xed) + 1; // "한"(ED 95 9C)의 첫 바이트 바로 뒤에서 자른다
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sseResponse([bytes.slice(0, cut), bytes.slice(cut)])),
    );
    const { promise } = run();
    expect((await promise).text).toBe('한글');
  });

  it('429는 rate-limit 오류이고 Retry-After를 넘긴다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('{}', { status: 429, headers: { 'retry-after': '3' } }),
      ),
    );
    const err = await run().promise.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err).toMatchObject({ code: 'rate-limit', retryAfter: '3' });
  });

  it('연결 실패는 network 오류이고 원인 코드를 남긴다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed', {
          cause: { code: 'ECONNREFUSED' },
        });
      }),
    );
    await expect(run().promise).rejects.toMatchObject({
      code: 'network',
      detail: 'ECONNREFUSED',
    });
  });

  it('사용자가 취소하면 canceled', async () => {
    vi.stubGlobal('fetch', hangingFetch());
    const controller = new AbortController();
    const { promise } = run(controller.signal);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: 'canceled' });
  });

  it('조각이 정해진 시간 동안 오지 않으면 timeout (가짜 타이머)', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hangingFetch());
    const { promise } = run(new AbortController().signal, 60_000);
    const check = expect(promise).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(60_000); // 60초를 기다리지 않고 시간을 앞당긴다
    await check;
  });

  it('본문 없이 끝나면 empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sseResponse(['data: [DONE]\n\n'])),
    );
    await expect(run().promise).rejects.toMatchObject({ code: 'empty' });
  });
});
