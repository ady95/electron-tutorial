# 프로젝트 규칙 — 매출 보고서 도우미 (Electron + Python)

지점별 매출 파일(엑셀·CSV)을 합쳐 월별 집계 보고서를 만드는 Python(pandas) 스크립트에 Electron 화면을 입힌 앱이다.

## 기술 기준

- Electron 45, Electron Forge 8 (Vite 플러그인), TypeScript, React 19
- Python 3.12 이상, uv로 가상 환경 관리 (`python/pyproject.toml`, `uv.lock`). pandas·openpyxl
- 배포본의 Python은 PyInstaller onedir로 만든 `sales-worker`를 `extraResource`로 넣는다 (`npm run build:python`)
- 새 npm·Python 패키지를 추가해야 하면 먼저 이유를 설명하고 승인을 받는다

## 구조

- `python/sales_report.py` — 원래 있던 스크립트. 명령줄에서 단독으로 실행되는 상태를 유지한다
- `python/worker.py` — Electron과 표준 입출력으로 통신하는 작업자 (JSON Lines)
- `src/python-host.ts` + `src/host/` — Python 관리자 (UtilityProcess). 작업자 실행·재시작·취소
- `src/main/report.ts` — 관리자 실행, 창과 관리자 사이 MessagePort 연결, 대화상자
- `src/preload.ts` — MessagePort를 보관하고 함수만 `window.api`로 노출
- `src/shared/` — 공용 타입과 순수 함수 (`protocol.ts`: 작업자 메시지 해석)

## Python 연동 규칙 (반드시 지킨다)

- 작업자의 표준 출력에는 프로토콜(JSON 한 줄)만 쓴다. `worker.py`는 시작할 때 `sys.stdout`을 stderr로 돌려 두었다. 이 처리를 지우지 않는다
- 프로토콜은 UTF-8 바이트로 쓰고 매번 flush한다. 콘솔 인코딩(CP949)·버퍼링 설정에 기대지 않는다
- 작업자는 표준 입력이 닫히면 스스로 끝난다. 이 동작을 지우지 않는다 (macOS에서는 부모가 죽어도 자식이 남는다)
- 파일을 쓰는 작업은 임시 파일에 쓴 뒤 바꿔치기한다. 취소·강제 종료로 반쯤 쓴 파일이 남지 않게 한다
- 진행률·결과는 관리자가 MessagePort로 화면에 보낸다. Main을 거치게 바꾸지 않는다
- 개발 중 경로(`.venv`)와 배포본 경로(`process.resourcesPath`)를 `pythonCommand()` 한 곳에서만 고른다

## 보안 규칙

- IPC는 `src/main/security.ts`의 `handle()`/`on()`으로 등록한다 (송신자 검증)
- 파일 경로는 Renderer가 정하지 않는다. 입력 폴더와 저장 위치는 Main이 대화상자로 받고, 화면에는 이름만 보낸다
- 화면(MessagePort)에서 온 메시지도 관리자에서 형식을 검사한다
- `nodeIntegration`, `contextIsolation`, `sandbox`, CSP 설정을 바꾸지 않는다
- 환경 변수로 바꾸는 설정(`SALES_PYTHON`, `SALES_BACKEND`)은 개발 중에만 따른다

## 작업 방식

- 작업 전에 바꿀 파일과 방법을 짧게 설명한다
- 요청받지 않은 리팩터링, 이름 변경, 포맷 변경을 하지 않는다
- 끝나면 아래 검증 명령을 모두 실행하고 결과를 보고한다. 실행하지 못한 것은 못 했다고 쓴다

## 검증 명령

```bash
npm test             # TypeScript 단위 테스트 (Electron 런타임)
npm run test:python  # Python 단위 테스트
npm run typecheck
npm run lint
npm run check:security
```

앱 실행(`npm start`)과 패키지 확인(`npm run build:python` → `npm run package`)은 사람이 확인한다.
