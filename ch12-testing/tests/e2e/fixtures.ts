// GUI 테스트 준비물(fixture) (12-3)
//  - mock: 가짜 LLM 서버 (테스트 파일마다 하나)
//  - app : 깨끗한 사용자 데이터 폴더로 띄운 앱 (테스트마다 새로)
//  - page: 앱의 첫 창
import {
  test as base,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startMockLlm } from '../mock-llm.mjs';

// Playwright는 이 파일을 CommonJS로 바꿔 실행한다 (package.json에 "type": "module"이 없다).
// 그래서 import.meta 대신 __dirname과 require를 쓴다
const appDir = path.resolve(__dirname, '..', '..');

type Mock = Awaited<ReturnType<typeof startMockLlm>>;

// 앱 실행 방법
//  - 기본: 프로덕션 빌드(.vite)를 electron . 으로 실행한다. 먼저 npm run package로 빌드한다
//  - APP_EXE 환경 변수: 패키지된 실행 파일을 직접 실행한다
export async function launchApp(userData: string, env: Record<string, string>) {
  const packaged = process.env.APP_EXE;
  const clean = { ...process.env, ...env } as Record<string, string>;
  delete clean.ELECTRON_RUN_AS_NODE; // 이 값이 있으면 Electron이 Node로 실행된다
  return electron.launch({
    executablePath: packaged ?? (require('electron') as string),
    args: [...(packaged ? [] : ['.']), `--user-data-dir=${userData}`],
    cwd: appDir,
    env: clean,
  });
}

export const test = base.extend<
  { model: string; userData: string; app: ElectronApplication; page: Page },
  { mock: Mock }
>({
  // 테스트에서 test.use({ model: 'mock-slow' })로 바꿀 수 있다
  model: ['mock-stream', { option: true }],

  mock: [
    async ({}, use) => {
      const mock = await startMockLlm();
      await use(mock);
      await mock.close();
    },
    { scope: 'worker' },
  ],

  userData: async ({}, use, testInfo) => {
    const dir = path.join(
      os.tmpdir(),
      'ch12-e2e',
      `${testInfo.workerIndex}-${Date.now()}`,
    );
    await use(dir);
    fs.rmSync(dir, { recursive: true, force: true });
  },

  app: async ({ mock, model, userData }, use) => {
    mock.reset();
    const app = await launchApp(userData, {
      OPENAI_BASE_URL: mock.url,
      OPENAI_MODEL: model,
      OPENAI_API_KEY: 'sk-test',
    });
    await use(app);
    await app.close().catch(() => {}); // 테스트 안에서 이미 닫았을 수 있다
  },

  page: async ({ app }, use) => {
    const page = await app.firstWindow();
    await page.waitForSelector('.composer textarea');
    await use(page);
  },
});

export { expect } from '@playwright/test';

// 질문을 보내고 답이 끝날 때까지 기다린다. 마지막 답 요소를 돌려준다
export async function ask(page: Page, text: string) {
  const before = await page.locator('.msg.assistant').count();
  await page.locator('.composer textarea').fill(text);
  await page.keyboard.press('Enter');
  const answer = page.locator('.msg.assistant').nth(before);
  await answer.waitFor();
  await page.waitForFunction(
    () => !document.querySelector('.msg.assistant.streaming'),
  );
  return answer;
}
