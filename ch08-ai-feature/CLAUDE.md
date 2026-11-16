# 프로젝트 규칙 — 일괄 이름 바꾸기 도구 (Electron)

파일 이름을 규칙에 따라 일괄로 바꾸는 데스크톱 앱이다. 작업 이력은 SQLite에, API 키는 safeStorage에 저장한다.

## 기술 기준

- Electron 45, Electron Forge 8 (Vite 플러그인), TypeScript, React 19
- Node.js 내장 모듈만 쓴다. 새 npm 패키지를 추가해야 하면 먼저 이유를 설명하고 승인을 받는다
- SQLite는 `node:sqlite`(DatabaseSync)를 쓴다

## 폴더 구조

- `src/main.ts` — 창 생성과 IPC 등록
- `src/main/` — Main 전용 모듈 (batch, history, settings, secrets, security)
- `src/preload.ts` — `window.api`로 노출할 함수만 정의
- `src/shared/` — Main과 Renderer가 함께 쓰는 타입과 순수 함수 (`ipc.ts`에 채널 이름과 타입)
- `src/renderer/` — React 화면

## 보안 규칙 (반드시 지킨다)

- IPC는 `src/main/security.ts`의 `handle()`/`on()`으로 등록한다. `ipcMain.handle()`을 직접 쓰지 않는다 (송신자 검증)
- 새 채널은 `src/shared/ipc.ts`의 `IPC`와 `ExposedApi`에 먼저 추가한다
- Renderer에서 온 값은 `unknown`으로 받고 Main에서 검사한다
- 파일 경로는 Renderer가 정하지 않는다. 저장·열기 위치는 Main이 대화상자로 받는다
- Preload는 함수만 노출한다. `ipcRenderer`나 이벤트 객체를 그대로 넘기지 않는다
- `nodeIntegration`, `contextIsolation`, `sandbox`, CSP 설정을 바꾸지 않는다
- 전체 경로, API 키는 Renderer로 보내지 않는다

## 작업 방식

- 작업 전에 바꿀 파일과 방법을 짧게 설명한다
- 요청받지 않은 리팩터링, 이름 변경, 포맷 변경을 하지 않는다
- BOM 같은 보이지 않는 문자는 소스에 직접 넣지 않고 이스케이프(백슬래시 u 표기)로 쓴다
- 끝나면 아래 검증 명령을 모두 실행하고 결과를 보고한다. 실행하지 못한 것은 못 했다고 쓴다

## 검증 명령

```bash
npm test
npm run typecheck
npm run lint
npm run check:security
```

앱 실행(`npm start`)은 사람이 확인한다.
