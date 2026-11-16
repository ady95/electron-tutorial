// 회사 중계 서버 예제 (11-2). 의존성 없이 Node.js만으로 실행한다.
//   npm run proxy   (proxy/.env를 읽는다. proxy/.env.example 참고)
//
// 앱은 이 서버를 "OpenAI 호환 서버"로 보고, API 키 자리에 사용자 토큰을 넣어 보낸다.
// 진짜 API 키는 이 서버에만 있다. 앱을 뜯어봐도 나오는 것은 그 사용자의 토큰뿐이다.
//
// 이 서버가 하는 일
//  - 사용자 토큰 확인 (401)
//  - 허용한 모델만 통과 (403)
//  - 사용자별 1분당 요청 수 제한 (429 + Retry-After)
//  - 출력 길이(max_tokens) 상한, 정해 둔 필드만 위로 전달
//  - 스트리밍 응답을 모으지 않고 그대로 흘려보냄
//  - 사용자·모델별 토큰 사용량 기록
//
// 운영할 때는 HTTPS 뒤에 두고, 토큰은 회사 로그인(SSO) 등으로 발급해야 한다. 이 예제는 구조만 보여 준다.
import http from 'node:http';
import { Readable } from 'node:stream';

const env = (name, fallback = '') => process.env[name]?.trim() || fallback;
const UPSTREAM = env('UPSTREAM_BASE_URL').replace(/\/+$/, '');
const UPSTREAM_KEY = env('UPSTREAM_API_KEY');
const MODELS = env('ALLOWED_MODELS')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const RATE_PER_MIN = Number(env('RATE_PER_MIN', '10'));
const MAX_TOKENS = Number(env('MAX_TOKENS', '2000'));
const PORT = Number(env('PORT', '8787'));
const HOST = env('HOST', '127.0.0.1');
// "이름:토큰,이름:토큰" → 토큰으로 사용자 찾기
const USERS = new Map(
  env('PROXY_USERS')
    .split(',')
    .map((pair) => pair.split(':').map((s) => s.trim()))
    .filter(([name, token]) => name && token)
    .map(([name, token]) => [token, name]),
);

if (!UPSTREAM || MODELS.length === 0 || USERS.size === 0) {
  console.error(
    'UPSTREAM_BASE_URL, ALLOWED_MODELS, PROXY_USERS를 설정하세요 (proxy/.env.example).',
  );
  process.exit(1);
}

const log = (...args) => console.log(new Date().toISOString(), ...args);

function sendError(res, status, message, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify({ error: { message, type: 'proxy' } }));
}

// 사용자별 최근 1분 동안의 요청 시각
const recent = new Map();
function checkRate(user, now = Date.now()) {
  const list = (recent.get(user) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= RATE_PER_MIN) {
    recent.set(user, list);
    return Math.ceil((60_000 - (now - list[0])) / 1000); // 가장 오래된 요청이 1분을 넘길 때까지
  }
  list.push(now);
  recent.set(user, list);
  return 0;
}

async function readJson(req, limit = 1_000_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('too-large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

// 스트리밍 조각을 그대로 흘려보내면서 마지막 usage만 엿본다
function watchUsage(onUsage) {
  let buffer = '';
  return (chunk) => {
    buffer += chunk.toString('utf8');
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:') || !line.includes('"usage"')) continue;
      try {
        const usage = JSON.parse(line.slice(5)).usage;
        if (usage) onUsage(usage);
      } catch {
        // usage가 아닌 조각은 무시한다
      }
    }
  };
}

async function chat(req, res, user) {
  let body;
  try {
    body = await readJson(req);
  } catch {
    return sendError(res, 400, '요청 본문을 읽을 수 없습니다.');
  }
  if (!MODELS.includes(body.model)) {
    return sendError(res, 403, '허용되지 않은 모델입니다.');
  }
  const wait = checkRate(user);
  if (wait > 0) {
    log(`[한도] ${user} ${wait}초 대기`);
    return sendError(res, 429, '요청이 너무 많습니다.', {
      'retry-after': String(wait),
    });
  }
  // 앱이 보낸 값 중 정해 둔 것만 위로 보낸다 (도구 호출·다른 옵션으로 비용을 키우지 못하게)
  const upstreamBody = {
    model: body.model,
    messages: body.messages,
    stream: body.stream === true,
    ...(body.stream === true
      ? { stream_options: { include_usage: true } }
      : {}),
    max_tokens: Math.min(Number(body.max_tokens) || MAX_TOKENS, MAX_TOKENS),
  };

  // 앱이 연결을 끊으면(중지·창 닫힘) 위쪽 요청도 끊는다. 끊지 않으면 아무도 안 읽는 답에 비용을 낸다
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) {
      log(`[취소] ${user} 연결 끊김 → 위쪽 요청 중단`);
      controller.abort();
    }
  });

  const started = Date.now();
  let upstream;
  try {
    upstream = await fetch(`${UPSTREAM}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${UPSTREAM_KEY}`,
      },
      body: JSON.stringify(upstreamBody),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) return;
    log('[오류] 위쪽 연결 실패', err.cause?.code ?? err.message);
    return sendError(res, 502, 'LLM 서버에 연결하지 못했습니다.');
  }
  if (!upstream.ok || !upstream.body) {
    // 위쪽의 오류 원문(키 일부가 들어 있을 수 있다)은 로그에만 남기고 상태 코드만 전한다
    log(
      `[오류] 위쪽 ${upstream.status}`,
      (await upstream.text().catch(() => '')).slice(0, 200),
    );
    const retry = upstream.headers.get('retry-after');
    return sendError(
      res,
      upstream.status,
      'LLM 서버 오류',
      retry ? { 'retry-after': retry } : {},
    );
  }

  // 스트리밍을 모으지 않고 받은 즉시 내보낸다. 앞단에 nginx 등이 있으면 버퍼링을 끄라는 헤더도 붙인다
  res.writeHead(200, {
    'content-type': upstream.headers.get('content-type') ?? 'text/event-stream',
    'cache-control': 'no-cache',
    'x-accel-buffering': 'no',
  });
  const onChunk = watchUsage((usage) => {
    log(
      `[사용량] ${user} ${body.model} 입력 ${usage.prompt_tokens} 출력 ${usage.completion_tokens} (${Date.now() - started}ms)`,
    );
  });
  try {
    for await (const chunk of Readable.fromWeb(upstream.body)) {
      onChunk(chunk);
      res.write(chunk);
    }
    res.end();
  } catch {
    // 앱이 중간에 끊은 경우. 위의 close 처리에서 이미 abort했다
    res.destroy();
  }
}

http
  .createServer(async (req, res) => {
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const user = USERS.get(token);
    if (!user) return sendError(res, 401, '사용자 토큰이 올바르지 않습니다.');

    if (req.method === 'GET' && req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(
        JSON.stringify({
          object: 'list',
          data: MODELS.map((id) => ({ id, object: 'model' })),
        }),
      );
    }
    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
      log(`[요청] ${user} ${req.method} ${req.url}`);
      return chat(req, res, user);
    }
    sendError(res, 404, '없는 경로입니다.');
  })
  .listen(PORT, HOST, () =>
    log(
      `중계 서버 시작: http://${HOST}:${PORT}/v1 (모델 ${MODELS.length}개, 사용자 ${USERS.size}명)`,
    ),
  );
