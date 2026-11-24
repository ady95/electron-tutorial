# ch13-installer — AI 채팅 설치 파일 만들기

책 13장 예제입니다. 12장의 AI 채팅 앱(`ch12-testing`, 태그 `ch12`)을 그대로 가져와 Windows·macOS 설치 파일을 만들고 코드 서명을 더합니다. 앱의 기능 설명은 `ch11-llm/README.md`, 테스트·디버깅은 `ch12-testing/README.md`를 참고하세요.

## 준비

```bash
npm install
cp .env.example .env   # 값을 채운다 (또는 앱의 설정 화면에서 입력)
npm start
```

### 내 PC의 Ollama (11-3)

[Ollama](https://ollama.com)를 설치하고 대화 모델을 하나 받습니다.

```bash
ollama pull qwen3.5:9b
```

앱의 머리글에서 "내 PC (Ollama)"를 고르고, 설정에서 모델·컨텍스트 크기·추론 켜기를 정합니다.

### 회사 중계 서버 (11-2)

진짜 API 키는 중계 서버에만 두고, 앱에는 사용자별 토큰만 넣습니다.

```bash
cp proxy/.env.example proxy/.env   # 위쪽 서버 주소·키, 허용 모델, 사용자 토큰을 채운다
npm run proxy                      # http://127.0.0.1:8787/v1
```

앱의 머리글에서 "회사 중계 서버"를 고르고, 설정에서 서버 주소와 사용자 토큰을 저장합니다.

## 단계별 태그

| 태그                    | 내용                                                                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ch13-step1`            | 메이커 정리(Windows Squirrel, macOS ZIP·DMG), 파일 이름은 ASCII(`ai-chat`), Squirrel 설치 이름                                                                 |
| `ch13-step2`            | 아이콘(`assets/icon.png` → `.ico`·`.icns`, `npx electron scripts/make-icons.cjs`), 실행 파일 속성·번들 ID·저작권, 배포 리소스(`extraResource`), 답변 완료 알림 |
| `ch13-step3`            | Windows 코드 서명: 환경 변수로 인증서를 받아 앱 폴더와 Setup.exe·Update.exe에 서명 (`windowsSign`)                                                             |
| `ch13-step4` (= `ch13`) | macOS 임시 서명(ad-hoc, `osxSign`의 `identity: '-'`): Info.plist를 바꾼 번들을 다시 서명해 "손상된 앱" 경고를 없앤다                                           |

## 구성

| 경로                                         | 내용                                                                                            |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/main/notify.ts`                         | 창을 보고 있지 않을 때 답변 완료 알림. 리소스 파일 경로(개발/패키지)                            |
| `src/main/chat.ts`                           | 대화 요청 하나를 처리. 이력 고르기, 재시도, 결과·오류를 포트로 보냄                             |
| `src/main/openai.ts`                         | OpenAI 호환 Chat Completions 스트리밍 호출 (fetch)                                              |
| `src/main/ollama.ts`                         | Ollama 고유 API(`/api/chat`) 스트리밍, 모델 목록, 메모리에 올라왔는지 확인                      |
| `src/main/providers.ts`                      | 서버 주소·모델·키 결정. 키는 저장할 때의 서버에만 보냄                                          |
| `src/main/secrets.ts`                        | safeStorage로 키·토큰 암호화 저장 (요청 경로마다 따로)                                          |
| `src/ai-handler.ts`                          | Local AI Handler (UtilityProcess). `LanguageModelUtility`를 상속해 Ollama로 연결                |
| `src/main/local-ai.ts`                       | 핸들러 프로세스 실행·재시작, 세션에 등록, 설정 전달                                             |
| `src/preload.ts`                             | 요청마다 MessageChannel을 만들고 포트는 숨긴 채 콜백만 노출                                     |
| `src/renderer/useChat.ts`                    | 대화 상태, 조각을 화면 프레임 단위로 묶어 반영                                                  |
| `src/renderer/markdown.ts`                   | marked + DOMPurify. 이미지는 불러오지 않고 글자로 표시                                          |
| `src/renderer/components/PromptApiPanel.tsx` | `LanguageModel`을 직접 쓰는 실험 화면                                                           |
| `src/shared/chat.ts`                         | 보낼 대화 고르기: 완료된 질문-답변 쌍, 길이 예산 (순수 함수, 테스트 있음)                       |
| `src/shared/tokens.ts`                       | 토큰 수 어림 (넉넉하게 센다)                                                                    |
| `src/shared/ndjson.ts`                       | 줄 단위 JSON 스트림 파서                                                                        |
| `src/shared/retry.ts`                        | Retry-After 해석과 대기 시간 계산                                                               |
| `proxy/server.mjs`                           | 회사 중계 서버 예제: 토큰 확인, 허용 모델, 사용자별 한도, 출력 상한, 스트리밍 통과, 사용량 기록 |

## 성능 측정 (12-1)

```bash
npm run package                 # .vite에 프로덕션 빌드를 만든다
CHAT_PERF=1 npx electron .      # 시작 시점과 프로세스별 메모리를 콘솔에 출력
```

Windows PowerShell에서는 `$env:CHAT_PERF="1"; npx electron .`로 실행합니다.

## 디버깅과 로그 (12-4)

- Main 디버깅: VS Code의 "Main 디버깅 (Forge)"(`.vscode/launch.json`), 또는 `npm start -- --inspect-electron` 후 포트 9229에 붙는다
- 화면 디버깅: 개발 중 앱 창에서 개발자 도구 (배포본에서는 열리지 않는다)
- 로그: 사용자 데이터 폴더의 `logs/main.log` (설정 → [로그 폴더 열기])
- 크래시 덤프: 사용자 데이터 폴더의 `Crashpad` (서버로 보내지 않는다)

## 설치 파일 만들기 (13장)

```bash
npm run make
# Windows: out/make/squirrel.windows/x64/ai-chat-setup.exe
# macOS:   out/make/dmg/arm64/ai-chat.dmg, out/make/zip/darwin/arm64/*.zip
```

### Windows 코드 서명 (13-3)

인증서(.pfx)와 암호는 저장소에 넣지 않고 환경 변수로 넘깁니다. 두 값이 없으면 서명하지 않고 만듭니다.

```powershell
$env:WINDOWS_CERTIFICATE_FILE = "C:\certs\codesign.pfx"
$env:WINDOWS_CERTIFICATE_PASSWORD = "<암호>"
npm run make
Get-AuthenticodeSignature "out\make\squirrel.windows\x64\ai-chat-setup.exe"
```

### macOS 임시 서명 (13-4)

인증서 없이 앱 번들 전체를 임시 서명(ad-hoc)합니다. 서명 검사는 통과하지만 공증(notarization)을 받지 않았으므로, 내려받은 앱을 처음 열 때 Gatekeeper가 막습니다. 시스템 설정 → 개인정보 보호 및 보안 → [그래도 열기]로 엽니다.

```bash
codesign --verify --deep --strict --verbose=2 "out/AI 채팅-darwin-arm64/AI 채팅.app"
codesign -dv "out/AI 채팅-darwin-arm64/AI 채팅.app"   # Signature=adhoc
```

## 검증

```bash
npm test                # Vitest (시스템 Node.js)
npm run test:electron   # 같은 테스트를 Electron에 들어 있는 Node.js로
npm run coverage        # 커버리지
npm run e2e             # 프로덕션 빌드 후 GUI 테스트 (Playwright)
npm run smoke:packaged -- "out/AI 채팅-win32-x64/ai-chat.exe"   # 패키지 앱이 실행되어 창이 뜨는지
npm run typecheck
npm run lint
npm run check:security
```
