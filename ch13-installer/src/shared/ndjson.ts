// 줄마다 JSON 하나가 오는 스트림(NDJSON) 파서. Ollama 고유 API의 스트리밍 형식이다.
// SSE 파서(sse.ts)처럼 조각이 줄 중간에서 끊겨 도착해도 완성된 줄만 처리한다
export function createNdjsonParser(onValue: (value: unknown) => void) {
  let buffer = '';
  const handle = (line: string) => {
    if (line.trim() !== '') onValue(JSON.parse(line));
  };
  return {
    push(chunk: string) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) handle(line);
    },
    end() {
      handle(buffer);
      buffer = '';
    },
  };
}
