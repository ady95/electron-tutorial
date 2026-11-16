// 대화 메시지와 "이번 요청에 보낼 이력 고르기". 순수 함수라 Electron 없이 테스트할 수 있다.
export type Role = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface FitResult {
  messages: ChatMessage[]; // 시스템 지시 + 보낼 대화
  dropped: number; // 예산을 넘어 보내지 않은 이전 메시지 수
  size: number; // 보낼 양 (measure 단위)
}

// LLM은 대화를 기억하지 않는다. 매 요청에 이전 대화를 함께 보내야 하고,
// 대화가 길어지면 모델의 한도(컨텍스트)를 넘는다. 그래서 최근 대화부터 거꾸로 담고 예산에서 멈춘다.
// 시스템 지시와 마지막 사용자 메시지는 항상 보낸다. 그것만으로 예산을 넘으면 null
export function fitHistory(
  system: string,
  history: ChatMessage[],
  budget: number,
  measure: (text: string) => number = (text) => text.length,
): FitResult | null {
  const last = history.at(-1);
  if (!last || last.role !== 'user') return null;
  let size = measure(system) + measure(last.content);
  if (size > budget) return null;

  const kept: ChatMessage[] = [last];
  for (let i = history.length - 2; i >= 0; i--) {
    const s = measure(history[i].content);
    if (size + s > budget) break;
    size += s;
    kept.unshift(history[i]);
  }
  // 질문 없이 답변만 남으면 모델이 헷갈리므로, 맨 앞이 답변이면 그것도 뺀다
  if (kept.length > 1 && kept[0].role === 'assistant') {
    size -= measure(kept[0].content);
    kept.shift();
  }
  return {
    messages: [{ role: 'system', content: system }, ...kept],
    dropped: history.length - kept.length,
    size,
  };
}

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
  done: boolean; // 답변이 끝까지 완료되었는가 (질문은 항상 true)
}

// 화면의 대화에서 "완료된 질문-답변 쌍"만 이력으로 고른다.
// 오류·중지된 답변은 물론, 그 답변을 받지 못한 질문도 다시 보내지 않는다
// (예: 너무 길어 거절된 질문이 다음 요청마다 다시 실리는 것을 막는다)
export function completedTurns(turns: Turn[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (let i = 0; i < turns.length - 1; i++) {
    const q = turns[i];
    const a = turns[i + 1];
    if (q.role === 'user' && a.role === 'assistant' && a.done) {
      out.push({ role: 'user', content: q.content });
      out.push({ role: 'assistant', content: a.content });
      i++;
    }
  }
  return out;
}
