import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // 테스트마다 모의(mock)를 원래대로 되돌린다
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/main/**', 'src/shared/**'],
      reporter: ['text-summary', 'text'],
    },
  },
});
