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
