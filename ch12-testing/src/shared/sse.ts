// Server-Sent Events(SSE) 줄 단위 파서. 순수 함수라 Electron 없이 테스트할 수 있다.
// 네트워크 조각(chunk)은 줄 중간에서 끊겨 도착할 수 있으므로, 완성된 줄만 처리하고 나머지는 남겨 둔다.
export function createSseParser(onData: (data: string) => void) {
  let buffer = '';
  let dataLines: string[] = [];

  const dispatch = () => {
    if (dataLines.length > 0) onData(dataLines.join('\n'));
    dataLines = [];
  };

  const handleLine = (line: string) => {
    if (line === '') return dispatch(); // 빈 줄 = 이벤트 하나 끝
    if (line.startsWith(':')) return; // 주석(연결 유지용)
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''));
    }
    // event:, id:, retry: 필드는 이 앱에서 쓰지 않는다
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      const lines = buffer.split(/\r\n|\r|\n/);
      buffer = lines.pop() ?? ''; // 마지막 조각은 아직 줄이 끝나지 않았을 수 있다
      for (const line of lines) handleLine(line);
    },
    end() {
      if (buffer !== '') handleLine(buffer);
      buffer = '';
      dispatch();
    },
  };
}
