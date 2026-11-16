// chat.ts 단위 테스트 (12-2). 의존 모듈을 vi.mock으로 바꾸고, 포트는 가짜 객체를 쓴다
import { EventEmitter } from 'node:events';
import type { MessagePortMain } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatEvent } from '../shared/ipc';
import { parseChatRequest, startChat } from './chat';
import { LlmError } from './llm';
import { streamOpenAi } from './openai';

// chat.ts가 불러오는 모듈을 통째로 가짜로 바꾼다 (electron을 불러오는 모듈도 이렇게 피한다)
vi.mock('./providers', () => ({
  resolveProvider: vi.fn(async () => ({
    id: 'openai',
    baseUrl: 'https://llm.example.com/v1',
    apiKey: 'k',
    model: 'm',
  })),
}));
vi.mock('./settings', () => ({
  getSettings: () => ({ llm: { local: { numCtx: 16384, think: false } } }),
}));
vi.mock('./openai', () => ({ streamOpenAi: vi.fn() }));
vi.mock('./ollama', () => ({ streamOllama: vi.fn(), isLoaded: vi.fn() }));

// MessagePortMain 흉내: postMessage로 보낸 것을 모아 둔다
class FakePort extends EventEmitter {
  sent: ChatEvent[] = [];
  closed = false;
  postMessage(event: ChatEvent) {
    this.sent.push(event);
  }
  start() {}
  close() {
    this.closed = true;
  }
}

const request = {
  provider: 'openai',
  messages: [{ role: 'user', content: '안녕' }],
};
const types = (port: FakePort) => port.sent.map((e) => e.type);
const ok = { text: '답', finishReason: 'stop', usage: null };

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(streamOpenAi).mockReset(); // 앞 테스트에서 남은 응답이 넘어오지 않게
});
afterEach(() => {
  vi.useRealTimers();
});

describe('parseChatRequest', () => {
  it('정상 요청을 통과시킨다', () => {
    expect(parseChatRequest(request)).toEqual(request);
  });
  it('system 역할은 받지 않는다 (시스템 지시는 Main만 정한다)', () => {
    expect(
      parseChatRequest({
        provider: 'openai',
        messages: [{ role: 'system', content: 'x' }],
      }),
    ).toBeNull();
  });
  it('모르는 요청 경로, 빈 대화, 너무 긴 메시지를 거부한다', () => {
    expect(parseChatRequest({ ...request, provider: 'evil' })).toBeNull();
    expect(parseChatRequest({ ...request, messages: [] })).toBeNull();
    expect(
      parseChatRequest({
        ...request,
        messages: [{ role: 'user', content: 'x'.repeat(100_001) }],
      }),
    ).toBeNull();
  });
});

describe('startChat 재시도', () => {
  it('429 두 번 뒤 성공하면 retry 두 번, done 한 번', async () => {
    vi.mocked(streamOpenAi)
      .mockRejectedValueOnce(new LlmError('rate-limit', '', '1'))
      .mockRejectedValueOnce(new LlmError('rate-limit', '', '1'))
      .mockResolvedValueOnce(ok);
    const port = new FakePort();
    startChat(port as unknown as MessagePortMain, request);
    // 1초씩 두 번 기다려야 하지만, 가짜 타이머로 바로 넘긴다
    await vi.advanceTimersByTimeAsync(2_000);
    expect(types(port)).toEqual(['retry', 'retry', 'done']);
    expect(port.sent[0]).toMatchObject({
      attempt: 1,
      delayMs: 1000,
      reason: 'rate-limit',
    });
    expect(port.closed).toBe(true);
  });

  it('Retry-After가 20초를 넘으면 기다리지 않고 알린다', async () => {
    vi.mocked(streamOpenAi).mockRejectedValueOnce(
      new LlmError('rate-limit', '', '60'),
    );
    const port = new FakePort();
    startChat(port as unknown as MessagePortMain, request);
    await vi.advanceTimersByTimeAsync(0);
    expect(types(port)).toEqual(['error']);
    expect(port.sent[0]).toMatchObject({
      message: expect.stringContaining('60초'),
    });
    expect(streamOpenAi).toHaveBeenCalledTimes(1);
  });

  it('글자가 이미 나온 뒤의 오류는 재시도하지 않는다', async () => {
    vi.mocked(streamOpenAi).mockImplementationOnce(async (_c, _m, handlers) => {
      handlers.onDelta('반쯤');
      throw new LlmError('server');
    });
    const port = new FakePort();
    startChat(port as unknown as MessagePortMain, request);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(types(port)).toEqual(['delta', 'error']);
  });

  it('인증 오류(401)는 재시도하지 않는다', async () => {
    vi.mocked(streamOpenAi).mockRejectedValueOnce(new LlmError('auth'));
    const port = new FakePort();
    startChat(port as unknown as MessagePortMain, request);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(types(port)).toEqual(['error']);
  });

  it('재시도를 기다리는 동안 취소하면 더 요청하지 않는다', async () => {
    vi.mocked(streamOpenAi).mockRejectedValue(new LlmError('server'));
    const port = new FakePort();
    startChat(port as unknown as MessagePortMain, request);
    await vi.advanceTimersByTimeAsync(0);
    port.emit('message', { data: { type: 'cancel' } });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(types(port)).toEqual(['retry', 'error']);
    expect(port.sent[1]).toMatchObject({ message: '중지했습니다.' });
    expect(streamOpenAi).toHaveBeenCalledTimes(1);
  });

  it('잘못된 요청은 바로 오류를 보내고 포트를 닫는다', () => {
    const port = new FakePort();
    startChat(port as unknown as MessagePortMain, { provider: 'openai' });
    expect(types(port)).toEqual(['error']);
    expect(port.closed).toBe(true);
  });
});
