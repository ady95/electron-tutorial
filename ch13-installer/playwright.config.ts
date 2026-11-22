import { defineConfig } from '@playwright/test';

// GUI 자동 테스트 설정 (12-3)
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  // Electron 앱은 창·포트·사용자 데이터 폴더를 쓰므로 한 번에 하나씩 실행한다
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    // 실패했을 때만 화면과 실행 기록을 남긴다 (test-results/)
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
