// Python 작업자와 주고받는 JSON Lines 메시지. Electron API를 쓰지 않는 순수 함수라 단위 테스트한다

export type WorkerMessage =
  | { id: number; type: 'progress'; done: number; total: number; file: string }
  | { id: number; type: 'result'; result: unknown }
  | { id: number; type: 'error'; code: string; message: string };

// 작업자가 보낸 한 줄을 해석한다. 프로토콜 메시지가 아니면 null
export function parseWorkerLine(line: string): WorkerMessage | null {
  let v: unknown;
  try {
    v = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const m = v as Record<string, unknown>;
  if (typeof m.id !== 'number') return null;
  switch (m.type) {
    case 'progress':
      return typeof m.done === 'number' &&
        typeof m.total === 'number' &&
        typeof m.file === 'string'
        ? {
            id: m.id,
            type: 'progress',
            done: m.done,
            total: m.total,
            file: m.file,
          }
        : null;
    case 'result':
      return { id: m.id, type: 'result', result: m.result };
    case 'error':
      return {
        id: m.id,
        type: 'error',
        code: typeof m.code === 'string' ? m.code : 'unknown',
        message: typeof m.message === 'string' ? m.message : '',
      };
    default:
      return null;
  }
}

// 작업자에게 보낼 한 줄. 줄바꿈은 JSON.stringify가 \n으로 이스케이프하므로 한 줄이 보장된다
export function encodeRequest(
  id: number,
  method: string,
  params?: unknown,
): string {
  return `${JSON.stringify({ id, method, params })}\n`;
}
