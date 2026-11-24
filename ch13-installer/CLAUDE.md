# 프로젝트 규칙 — AI 채팅 (Electron + LLM)

원격 LLM API와 로컬 모델(Ollama)을 연결한 채팅 앱이다. 12장에서 성능 측정·테스트·디버깅을, 13장에서 설치 파일과 코드 서명을 더한다.

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
- `src/main/log.ts`, `src/main/crash.ts` — 로그 파일, 크래시·예외 처리 (12-4)
- `src/main/notify.ts` — 답변 완료 알림. 리소스 파일은 `resourcePath()`로 찾는다 (13-2)
- `assets/` — 앱 아이콘 원본(`icon.png`, 1024×1024)과 만든 `.ico`·`.icns` (`scripts/make-icons.cjs`)
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

## 테스트 규칙 (12-2)

- 단위 테스트는 Vitest. `src/**/*.test.ts`에 둔다. electron을 불러오는 모듈은 `vi.mock`으로 바꿔 Electron 없이 실행한다
- 시간을 기다리는 코드는 전역 `setTimeout`을 쓴다. `node:timers/promises`는 가짜 타이머가 바꾸지 못한다
- GUI 테스트는 `tests/e2e/`, Playwright. 프로덕션 빌드(`npm run package`)를 띄우고 가짜 LLM 서버(`tests/mock-llm.mjs`)를 쓴다. 실제 LLM에 요청하지 않는다
- 패키지 앱은 Fuse 때문에 Playwright가 붙지 못한다. `tests/smoke-packaged.mjs`로 실행 여부만 확인한다
- 테스트용 파일에서 `import.meta`와 최상위 `await`를 쓰지 않는다 (Playwright가 CommonJS로 바꿔 실행한다)
- 보안 규칙(송신자 검증, 키 전송 대상)을 고치면 해당 테스트를 먼저 고치고 통과시킨다

## 로그·오류 규칙 (12-4)

- Main에서 기록할 때는 `console` 대신 `src/main/log.ts`의 `log`를 쓴다. 비밀은 `redact()`로 가려진다
- 화면 오류는 `window.api.reportError`로 Main 로그에 모인다. 사용자에게는 원문 대신 할 일을 안내한다
- 배포본에서 개발자 도구와 원격 디버깅 스위치를 다시 허용하지 않는다
- 소스맵은 개발 빌드에만 만든다

## 배포 규칙 (13장)

- 파일 이름(실행 파일, 설치 파일)은 ASCII(`ai-chat`)로 한다. 화면에 보이는 이름은 productName("AI 채팅")
- Squirrel의 `name`(설치 폴더·AppUserModelID)과 macOS `appBundleId`는 첫 배포 뒤에 바꾸지 않는다. 바꾸면 다른 앱이 된다
- 아이콘을 바꾸면 `assets/icon.png`만 고치고 `npx electron scripts/make-icons.cjs`로 다시 만든다
- 패키지 앱이 읽는 파일은 `extraResource`로 넣고 `resourcePath()`로 찾는다. 개발 중 경로를 그대로 쓰지 않는다
- 인증서 파일·암호는 저장소와 설정 파일에 넣지 않는다. `WINDOWS_CERTIFICATE_FILE`·`WINDOWS_CERTIFICATE_PASSWORD` 환경 변수로만 받는다
- 서명한 실행 파일은 고치지 않는다 (Fuse 변경 포함). 바꿀 것이 있으면 서명 전 단계(설정)에서 바꾸고 다시 만든다
- macOS 빌드는 `osxSign`으로 번들 전체를 서명한다. 만든 뒤 `codesign --verify --deep --strict`로 확인한다
- 사용자에게 `xattr -dr com.apple.quarantine`을 안내하지 않는다. 서명이 깨진 앱도 검사 없이 열린다

## 보안 규칙

- IPC는 `src/main/security.ts`의 `handle()`/`on()`으로 등록한다 (송신자 검증)
- `nodeIntegration`, `contextIsolation`, `sandbox`, CSP 설정을 바꾸지 않는다

## 작업 방식

- 작업 전에 바꿀 파일과 방법을 짧게 설명한다
- 요청받지 않은 리팩터링, 이름 변경, 포맷 변경을 하지 않는다
- 끝나면 아래 검증 명령을 모두 실행하고 결과를 보고한다. 실행하지 못한 것은 못 했다고 쓴다

## 검증 명령

```bash
npm test             # Vitest 단위 테스트
npm run test:electron  # 같은 테스트를 Electron 런타임으로 (Node 버전 차이 확인)
npm run typecheck
npm run lint
npm run check:security
npm run e2e          # GUI 테스트 (화면이 있는 환경에서)
```

앱 실행(`npm start`)과 실제 LLM 응답은 사람이 확인한다.
