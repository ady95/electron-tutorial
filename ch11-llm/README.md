# ch11-llm — AI 채팅

책 11장 예제입니다. 원격 LLM API와 내 PC의 로컬 모델을 연결한 채팅 앱입니다. 9장의 문서 분석 앱이 "한 번 묻고 끝나는" 앱이었다면, 이 앱은 대화가 이어집니다.

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

| 태그         | 내용                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------- |
| `ch11-step1` | 원격 LLM 채팅: 대화 이력, 요청별 MessagePort 스트리밍, 마크다운 안전하게 표시, 429·5xx 재시도 |
| `ch11-step2` | 요청 경로 선택: 내 API 키로 직접 / 회사 중계 서버(`proxy/`)에 사용자 토큰으로                 |

## 구성

| 경로                       | 내용                                                                |
| -------------------------- | ------------------------------------------------------------------- |
| `src/main/chat.ts`         | 대화 요청 하나를 처리. 이력 고르기, 재시도, 결과·오류를 포트로 보냄 |
| `src/main/openai.ts`       | OpenAI 호환 Chat Completions 스트리밍 호출 (fetch)                  |
| `src/main/providers.ts`    | 서버 주소·모델·키 결정. 키는 저장할 때의 서버에만 보냄              |
| `src/main/secrets.ts`      | safeStorage로 키 암호화 저장                                        |
| `src/preload.ts`           | 요청마다 MessageChannel을 만들고 포트는 숨긴 채 콜백만 노출         |
| `src/renderer/useChat.ts`  | 대화 상태, 조각을 화면 프레임 단위로 묶어 반영                      |
| `src/renderer/markdown.ts` | marked + DOMPurify. 이미지는 불러오지 않고 글자로 표시              |
| `src/shared/chat.ts`       | 길이 예산 안에서 보낼 대화 고르기 (순수 함수, 테스트 있음)          |
| `src/shared/retry.ts`      | Retry-After 해석과 대기 시간 계산 (순수 함수, 테스트 있음)          |

## 검증

```bash
npm test
npm run typecheck
npm run lint
npm run check:security
```
