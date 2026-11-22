// 채팅 화면 GUI 테스트 (12-3). 가짜 LLM 서버를 상대로 사용자가 하는 동작을 그대로 해 본다
import { ask, expect, launchApp, test } from './fixtures';

test('처음 화면: 안내 문구와 비어 있는 대화', async ({ page }) => {
  await expect(page).toHaveTitle('AI 채팅');
  await expect(page.locator('.empty')).toContainText('무엇이든 물어보세요');
  await expect(page.getByRole('button', { name: '보내기' })).toBeDisabled();
});

test('답이 스트리밍으로 오고, 끝나면 시간·토큰을 보여 준다', async ({
  page,
  mock,
}) => {
  await page.locator('.composer textarea').fill('안녕하세요');
  await page.keyboard.press('Enter');
  // 스트리밍 중에는 [중지] 버튼이 보인다
  await expect(page.getByRole('button', { name: '중지' })).toBeVisible();
  const answer = page.locator('.msg.assistant').first();
  await expect(answer).toHaveClass(/done/, { timeout: 10_000 });
  await expect(answer.locator('.md strong')).toHaveText('굵게');
  await expect(answer.locator('.meta')).toContainText('토큰 10+20');
  expect(mock.requests.at(-1)).toMatchObject({ messages: 2, auth: true });
});

test('이어지는 대화는 앞의 질문과 답을 함께 보낸다', async ({ page, mock }) => {
  await ask(page, '첫 질문');
  await ask(page, '두 번째 질문');
  expect(mock.requests.map((r) => r.messages)).toEqual([2, 4]);
});

test.describe('중지', () => {
  test.use({ model: 'mock-slow' });

  test('[중지]를 누르면 받은 데까지 남고 서버 연결도 끊긴다', async ({
    page,
    mock,
  }) => {
    await page.locator('.composer textarea').fill('천천히');
    await page.keyboard.press('Enter');
    const answer = page.locator('.msg.assistant').first();
    await expect(answer.locator('.md')).not.toBeEmpty();
    await page.getByRole('button', { name: '중지' }).click();
    await expect(answer.locator('.error')).toHaveText('중지했습니다.');
    await expect.poll(() => mock.requests[0]?.closedEarly).toBe(true);
  });
});

test.describe('재시도', () => {
  test.use({ model: 'mock-429-then-ok' });

  test('429 두 번 뒤에 답이 나온다', async ({ page, mock }) => {
    await page.locator('.composer textarea').fill('재시도');
    await page.keyboard.press('Enter');
    const answer = page.locator('.msg.assistant').first();
    await expect(answer.locator('.notice')).toContainText('다시 시도합니다');
    await expect(answer).toHaveClass(/done/, { timeout: 15_000 });
    expect(mock.requests).toHaveLength(3);
  });
});

test.describe('위험한 출력', () => {
  test.use({ model: 'mock-xss' });

  test('스크립트는 실행되지 않고 https 링크만 기본 브라우저로 연다', async ({
    app,
    page,
  }) => {
    // Main의 shell.openExternal을 가짜로 바꿔 무엇을 열려고 했는지 기록한다
    await app.evaluate(({ shell }) => {
      const opened: string[] = [];
      (globalThis as unknown as { opened: string[] }).opened = opened;
      shell.openExternal = async (url: string) => {
        opened.push(url);
      };
    });
    const answer = await ask(page, '위험한 출력');
    await expect(answer.locator('.md img')).toHaveCount(0);
    await expect(answer.locator('.md script')).toHaveCount(0);
    await answer.getByText('눌러 보세요').click();
    await answer.getByText('공식 문서').click();
    expect(
      await page.evaluate(
        () => (window as unknown as { __xss?: string }).__xss,
      ),
    ).toBeUndefined();
    await expect
      .poll(() =>
        app.evaluate(
          () => (globalThis as unknown as { opened: string[] }).opened,
        ),
      )
      .toEqual(['https://example.com/docs']);
  });
});

test('설정과 키는 앱을 다시 켜도 남고, 키는 평문으로 저장되지 않는다', async ({
  app,
  page,
  mock,
  userData,
}) => {
  await page.getByRole('button', { name: '설정' }).click();
  await page.getByLabel('모델', { exact: true }).fill('mock-stream');
  await page.getByRole('button', { name: '설정 저장' }).click();
  await expect(page.locator('.result')).toHaveText('설정을 저장했습니다.');
  await page.getByPlaceholder('API 키 붙여넣기').fill('sk-saved-1234');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.locator('.settings p').first()).toContainText(
    '끝자리 ...1234',
  );
  await app.close();

  const fs = await import('node:fs');
  const path = await import('node:path');
  const secrets = fs.readFileSync(path.join(userData, 'secrets.json'), 'utf8');
  expect(secrets).not.toContain('sk-saved-1234');

  const again = await launchApp(userData, {
    OPENAI_BASE_URL: mock.url,
    OPENAI_MODEL: 'mock-stream',
  });
  const page2 = await again.firstWindow();
  await page2.getByRole('button', { name: '설정' }).click();
  await expect(page2.getByLabel('모델', { exact: true })).toHaveValue(
    'mock-stream',
  );
  await expect(page2.locator('.settings p').first()).toContainText(
    '끝자리 ...1234',
  );
  await again.close();
});
