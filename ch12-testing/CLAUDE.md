# 프로젝트 규칙 — AI 채팅 (Electron + LLM)

원격 LLM API와 로컬 모델(Ollama)을 연결한 채팅 앱이다. 12장에서 성능 측정·테스트·디버깅을 더한다.

## 기술 기준

- Electron 45, Electron Forge 8 (Vite 플러그인), TypeScript, React 19
- LLM은 SDK 없이 fetch로 부른다. 마크다운은 marked, 정화는 DOMPurify (버전 고정)
- 새 npm 패키지를 추가해야 하면 먼저 이유를 설명하고 승인을 받는다

## 구조

- `src/main/chat.ts` — 대화 요청 처리 (이력 고르기, 재시도, 포트로 결과 전송)
- `src/main/openai.ts` — OpenAI 호환 API 호출
- `src/main/ollama.ts` — Ollama 고유 API 호출 (num_ctx, think)
- `src/main/providers.ts` — 요청 경로 결정 (서버 주소·모델·키)
- `src/main/secrets.ts` — safeStorage 키 저장
- `proxy/server.mjs` — 회사 중계 서버 예제 (앱과 별도로 실행)
- `src/ai-handler.ts` + `src/main/local-ai.ts` — Local AI Handler (실험 기능, UtilityProcess)
- `src/preload.ts` — 요청마다 MessageChannel. 포트는 화면에 넘기지 않는다
- `src/renderer/` — 화면. `markdown.ts`만 HTML을 만든다
- `src/shared/` — 공용 타입과 순수 함수 (테스트 대상)

## LLM 연동 규칙 (반드시 지킨다)

- API 키는 Main에서만 다룬다. Renderer·로그·오류 메시지에 키나 서버 원문 오류를 내보내지 않는다
- 키는 저장할 때의 서버 주소(origin)에만 보낸다. 환경 변수의 키는 서버 주소도 환경 변수일 때만 쓴다
- LLM의 답은 신뢰하지 않는 입력이다. HTML로 바꿀 때는 반드시 `renderMarkdown()`(DOMPurify)을 거친다. 이미지는 불러오지 않는다
- 재시도는 429·5xx만, 화면에 글자가 나오기 전에만 한다. 서버의 Retry-After를 따른다
- 앱 코드·빌드 결과물에 API 키를 넣지 않는다 (`VITE_` 환경 변수 포함). 빌드 결과는 누구나 열어 볼 수 있다
- 로컬 모델은 컨텍스트를 넘기면 앞부분을 조용히 버린다. 보내기 전에 `estimateTokens()`로 어림해 `fitHistory()`로 맞춘다
- 요청 하나는 포트 하나다. 포트가 닫히면(창 닫힘·새로고침) 요청을 끊는다

## Local AI Handler 규칙 (실험 기능)

- 핸들러는 `securityOrigin`이 앱 화면의 출처일 때만 클래스를 돌려준다. 같은 세션의 다른 출처 페이지도 요청할 수 있다
- 핸들러 함수는 창·출처마다 한 번만 불린다. 설정은 복사해 두지 말고 쓸 때마다 읽는다
- UtilityProcess 쪽은 `process.parentPort`로 통신한다. `electron/utility`는 빌드에서 외부 모듈로 둔다 (`vite.main.config.mts`)
- Electron 버전을 올리면 이 기능부터 다시 확인한다 (API가 바뀌거나 사라질 수 있다)

## 성능 규칙 (12-1)

- 성능은 프로덕션 빌드로 잰다 (`npm run package` 후 `CHAT_PERF=1`로 실행). 개발 서버 모드는 느리고 메모리를 더 쓴다
- 최적화는 측정으로 효과를 확인한 뒤에 넣는다. 결과를 바꾸지 못한 최적화는 넣지 않는다
- 쓰지 않을 수도 있는 프로세스(Local AI Handler)는 필요할 때 시작한다

## 보안 규칙

- IPC는 `src/main/security.ts`의 `handle()`/`on()`으로 등록한다 (송신자 검증)
- `nodeIntegration`, `contextIsolation`, `sandbox`, CSP 설정을 바꾸지 않는다

## 작업 방식

- 작업 전에 바꿀 파일과 방법을 짧게 설명한다
- 요청받지 않은 리팩터링, 이름 변경, 포맷 변경을 하지 않는다
- 끝나면 아래 검증 명령을 모두 실행하고 결과를 보고한다. 실행하지 못한 것은 못 했다고 쓴다

## 검증 명령

```bash
npm test             # 단위 테스트 (Electron 런타임)
npm run typecheck
npm run lint
npm run check:security
```

앱 실행(`npm start`)과 실제 LLM 응답은 사람이 확인한다.
