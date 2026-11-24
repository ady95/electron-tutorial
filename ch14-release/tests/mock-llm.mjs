// 테스트용 가짜 OpenAI 호환 서버 (12장). 모델 이름으로 동작을 고른다.
//   mock-stream       : 0.1초마다 조각 하나 (약 2초)
//   mock-slow         : 0.5초마다 조각 하나 (중지 시험)
//   mock-instant      : 긴 마크다운 답을 한 번에
//   mock-long         : 짧은 조각 300개를 이어서 (긴 대화의 스트리밍 측정)
//   mock-429-then-ok  : 처음 2번 429(Retry-After: 1), 이후 정상
//   mock-500 / mock-401
//   mock-xss          : 위험한 HTML이 섞인 답
// 직접 실행: node tests/mock-llm.mjs 18080
import http from 'node:http';

const sse = (obj) => `data: ${JSON.stringify(obj)}\n\n`;
const chunk = (delta, finish = null) => ({
  object: 'chat.completion.chunk',
  choices: [{ index: 0, delta, finish_reason: finish }],
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 표·코드 블록·목록이 섞인 약 1,600자 마크다운
const LONG_ANSWER = [
  '## 요약',
  '',
  '| 구분 | Main | Renderer |',
  '|---|---|---|',
  '| 개수 | 하나 | 창마다 |',
  '| Node.js | 사용 | 사용 안 함 |',
  '',
  ...Array.from(
    { length: 12 },
    (_, i) =>
      `- **항목 ${i + 1}**: 긴 대화에서 화면이 느려지는지 확인하기 위한 문장입니다. \`코드\`도 섞습니다.`,
  ),
  '',
  '```ts',
  ...Array.from(
    { length: 15 },
    (_, i) => `const value${i} = compute(${i}); // 예시 코드 줄`,
  ),
  '```',
].join('\n');

const XSS = [
  '<img src="x" onerror="window.__xss = \'img\'">',
  '<script>window.__xss = "script"</script>',
  "[눌러 보세요](javascript:window.__xss='link')",
  '<a href="https://example.com/docs">공식 문서</a>',
].join('\n\n');

export function startMockLlm(port = 0) {
  const counts = new Map();
  const requests = []; // 테스트에서 확인할 요청 기록
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', async () => {
      let parsed = {};
      try {
        parsed = JSON.parse(body);
      } catch {
        // 본문이 없거나 JSON이 아니다
      }
      const model = parsed.model ?? '';
      const n = (counts.get(model) ?? 0) + 1;
      counts.set(model, n);
      const record = {
        model,
        messages: parsed.messages?.length ?? 0,
        auth: Boolean(req.headers.authorization),
        closedEarly: false,
      };
      requests.push(record);
      res.on('close', () => {
        if (!res.writableFinished) record.closedEarly = true;
      });
      const fail = (status, headers = {}) => {
        res.writeHead(status, {
          'content-type': 'application/json',
          ...headers,
        });
        res.end(JSON.stringify({ error: { message: `mock ${status}` } }));
      };
      if (model === 'mock-401') return fail(401);
      if (model === 'mock-500') return fail(500);
      if (model === 'mock-429-then-ok' && n <= 2)
        return fail(429, { 'retry-after': '1' });

      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      });
      const send = async (pieces, gap) => {
        for (const p of pieces) {
          if (res.destroyed) return false;
          res.write(sse(chunk({ content: p })));
          if (gap) await wait(gap);
        }
        return true;
      };
      let ok = true;
      if (model === 'mock-instant') ok = await send([LONG_ANSWER], 0);
      else if (model === 'mock-long')
        ok = await send(LONG_ANSWER.match(/[\s\S]{1,6}/g).slice(0, 300), 10);
      else if (model === 'mock-xss') ok = await send([XSS], 0);
      else {
        const words =
          '가짜 서버가 보내는 스트리밍 응답입니다. 조각이 차례로 도착합니다. **굵게**와 `코드`도 있습니다.'.split(
            ' ',
          );
        ok = await send(
          words.map((w, i) => (i ? ' ' : '') + w),
          model === 'mock-slow' ? 500 : 100,
        );
      }
      if (!ok) return;
      res.write(sse(chunk({}, 'stop')));
      res.write(
        sse({
          object: 'chat.completion.chunk',
          choices: [],
          usage: { prompt_tokens: 10, completion_tokens: 20 },
        }),
      );
      res.end('data: [DONE]\n\n');
    });
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}/v1`,
        requests,
        reset: () => {
          counts.clear();
          requests.length = 0;
        },
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

// node tests/mock-llm.mjs [port] 로 직접 실행할 때
// Playwright가 이 파일을 CommonJS로 바꿔 불러오므로 import.meta와 최상위 await를 쓰지 않는다
if (process.argv[1]?.endsWith('mock-llm.mjs')) {
  startMockLlm(Number(process.argv[2] ?? 18080)).then((mock) => {
    console.log(`mock LLM: ${mock.url}`);
  });
}
