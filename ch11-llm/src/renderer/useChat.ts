// 대화 상태와 스트리밍 처리
import { useCallback, useRef, useState } from 'react';
import { completedTurns, type ChatMessage } from '../shared/chat';
import type { ChatEvent, ChatHandle, ProviderId } from '../shared/ipc';

export interface UiMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  reasoning: string;
  state: 'streaming' | 'done' | 'error';
  startedAt: number;
  notice?: string; // 잠깐 보여 줄 안내 (재시도, 모델 불러오는 중). 첫 글자가 오면 지운다
  dropped?: number; // 길이 제한 때문에 보내지 않은 이전 메시지 수 (계속 보여 준다)
  meta?: string; // 완료 후: 시간·토큰
  error?: string;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}초`;

function describeDone(e: Extract<ChatEvent, { type: 'done' }>) {
  const parts = [e.model];
  if (e.firstTokenMs !== null) parts.push(`첫 조각 ${seconds(e.firstTokenMs)}`);
  parts.push(`전체 ${seconds(e.totalMs)}`);
  if (e.usage) {
    parts.push(`토큰 ${e.usage.promptTokens}+${e.usage.completionTokens}`);
  }
  if (e.tokensPerSec) parts.push(`초당 ${e.tokensPerSec.toFixed(1)}토큰`);
  if (e.finishReason && e.finishReason !== 'stop') {
    parts.push(`종료 이유 ${e.finishReason}`);
  }
  return parts.join(' · ');
}

export function useChat(provider: ProviderId) {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const handle = useRef<ChatHandle | null>(null);
  const nextId = useRef(1);

  // 조각이 올 때마다 setState를 하면 조각 수만큼 다시 그린다(마크다운 변환 포함).
  // 조각은 여기 모아 두고, 화면이 다음에 그려질 때(requestAnimationFrame) 한 번에 반영한다
  const pending = useRef({ id: 0, content: '', reasoning: '' });
  const frame = useRef(0);

  const patch = (id: number, change: (m: UiMessage) => Partial<UiMessage>) =>
    setMessages((ms) =>
      ms.map((m) => (m.id === id ? { ...m, ...change(m) } : m)),
    );

  const flush = () => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    const { id, content, reasoning } = pending.current;
    if (content === '' && reasoning === '') return;
    pending.current = { id, content: '', reasoning: '' };
    patch(id, (m) => ({
      content: m.content + content,
      reasoning: m.reasoning + reasoning,
      notice: undefined,
    }));
  };

  const queue = (id: number, kind: 'content' | 'reasoning', text: string) => {
    pending.current.id = id;
    pending.current[kind] += text;
    if (frame.current === 0) frame.current = requestAnimationFrame(flush);
  };

  const busy = messages.some((m) => m.state === 'streaming');

  const send = useCallback(
    (text: string) => {
      if (busy || text.trim() === '') return;
      // 완료된 질문-답변 쌍만 이력으로 보낸다
      const history: ChatMessage[] = completedTurns(
        messages.map((m) => ({ ...m, done: m.state === 'done' })),
      );
      history.push({ role: 'user', content: text });

      const userId = nextId.current++;
      const id = nextId.current++;
      const now = Date.now();
      setMessages((ms) => [
        ...ms,
        {
          id: userId,
          role: 'user',
          content: text,
          reasoning: '',
          state: 'done',
          startedAt: now,
        },
        {
          id,
          role: 'assistant',
          content: '',
          reasoning: '',
          state: 'streaming',
          startedAt: now,
        },
      ]);

      const onEvent = (e: ChatEvent) => {
        switch (e.type) {
          case 'delta':
            return queue(id, 'content', e.text);
          case 'reasoning':
            return queue(id, 'reasoning', e.text);
          case 'status':
            return patch(id, () => ({ notice: e.text }));
          case 'context':
            return patch(id, () => ({ dropped: e.dropped }));
          case 'retry':
            return patch(id, () => ({
              notice: `${e.reason === 'rate-limit' ? '요청 한도 초과' : '서버 오류'}. ${seconds(e.delayMs)} 뒤 다시 시도합니다 (${e.attempt}번째).`,
            }));
          case 'done':
            flush();
            handle.current = null;
            return patch(id, () => ({
              state: 'done',
              meta: describeDone(e),
              notice: undefined,
            }));
          case 'error':
            flush();
            handle.current = null;
            return patch(id, () => ({
              state: 'error',
              error: e.message,
              notice: undefined,
            }));
        }
      };
      handle.current = window.api.chat(
        { provider, messages: history },
        onEvent,
      );
    },
    [busy, messages, provider],
  );

  const stop = () => handle.current?.cancel();
  const reset = () => {
    if (!busy) setMessages([]);
  };

  return { messages, busy, send, stop, reset };
}
