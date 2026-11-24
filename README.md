# electron-tutorial

위키독스 책 「Electron 데스크톱 앱 개발 따라하기 — AI 코딩으로 만드는 데스크톱 앱, 개발부터 배포 자동화까지」의 예제 코드 저장소입니다.

- 책: [https://wikidocs.net/book/22177](https://wikidocs.net/book/22177)

## 기준 환경

| 항목 | 버전 |
|---|---|
| Electron | 45.3.2 |
| Electron Forge | 8.0.1 (Vite 플러그인) |
| Node.js | 26 LTS (22.12.0 이상 필요) |
| 실측 OS | Windows 11, macOS (Apple Silicon) |

## 폴더 구성

| 폴더 | 장 | 내용 |
|---|---|---|
| `ch02-first-app` | 2장 | Electron Forge + Vite + TypeScript 첫 프로젝트 |
| `ch03-ipc` | 3장 | Preload·contextBridge, IPC 세 패턴, AI로 추가한 메모리 표시 기능 (태그 `ch03-step1`, `ch03`) |
| `ch04-memo` | 4장 | React + TypeScript 메모장 UI |
| `ch05-memo` | 5장 | 파일 열기·저장, 메뉴·단축키, 드래그 앤 드롭 메모장 |
| `ch05-batch` | 5장 | 파일 일괄 이름 바꾸기 도구 (미리보기, 진행률, 취소, 되돌리기) |
| `ch06-history` | 6장 | 일괄 처리 도구 + 설정 저장, SQLite(`node:sqlite`) 작업 이력과 FTS5 검색, safeStorage API 키 보관 |
| `ch07-secure` | 7장 | 6장 앱 + IPC 송신자 검증, 내비게이션·새 창·권한 제한, 경로 이중 검사 (`src/main/security.ts`) |
| `ch08-ai-feature` | 8장 | 7장 앱 + Claude Code와 함께 추가한 작업 이력 CSV 내보내기, 프로젝트 규칙(`CLAUDE.md`)·권한 설정(`.claude/settings.json`), `npm test` |
| `ch09-workbench` | 9장 | AI 문서 분석 워크벤치: PDF·텍스트 불러오기, LLM 요약·핵심어·질문(스트리밍), SQLite 저장·검색, 오류 처리·취소 (태그 `ch09-step1`~`ch09-step5`, `ch09`) |
| `ch10-python` | 10장 | 매출 보고서 도우미: 기존 Python(pandas) 스크립트를 표준 입출력(JSON Lines) 작업자로 연결, UtilityProcess·MessagePort 분리, FastAPI 방식 비교, PyInstaller 패키징 (태그 `ch10-step1`~`ch10-step5`, `ch10`) |
| `ch11-llm` | 11장 | AI 채팅: 원격 LLM 스트리밍(요청별 MessagePort, 마크다운 정화, 재시도), 요청 경로(내 API 키 / 회사 중계 서버 예제), 내 PC의 Ollama(컨텍스트·추론), 실험 기능 Local AI Handler (태그 `ch11-step1`~`ch11-step4`, `ch11`) |
| `ch12-testing` | 12장 | AI 채팅 품질 다지기: 성능 측정(시작 시간·메모리), Vitest 단위 테스트 57개, Playwright GUI 테스트 7개와 패키지 스모크 테스트, 로그·크래시 처리, 배포본 디버깅 차단 (태그 `ch12-step1`~`ch12-step4`, `ch12`) |
| `ch13-installer` | 13장 | AI 채팅 설치 파일: Squirrel Setup.exe·DMG·ZIP, ASCII 파일 이름, 아이콘 생성 스크립트, 실행 파일·번들 정보, 배포 리소스와 답변 완료 알림, Windows 코드 서명(환경 변수), macOS 임시 서명 (태그 `ch13-step1`~`ch13-step4`, `ch13`) |
| `ch14-release` | 14장 | AI 채팅 배포 자동화: GitHub Actions CI(Windows·macOS 검사·GUI 테스트·설치 파일), 태그 push로 GitHub Releases 배포(CI 서명), update-electron-app 자동 업데이트 (태그 `ch14-step1`~`ch14-step4`, `ch14`, 릴리스 `v1.0.0`·`v1.0.1`) |

장이 진행되면서 폴더가 추가됩니다. 단계별 결과는 Git 태그(예: `ch02`)로도 받을 수 있습니다.

## 실행 방법

```bash
git clone https://github.com/ady95/electron-tutorial.git
cd electron-tutorial/ch02-first-app
npm install
npm start
```

첫 `npm start`는 Electron 실행 파일(350MB 이상)을 내려받느라 몇 분 걸릴 수 있습니다.

`node_modules`는 OS별로 다르므로 다른 PC에서 복사하지 말고 각 PC에서 `npm install`로 새로 설치하세요.
