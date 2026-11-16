import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // 11-4: UtilityProcess에서 쓰는 'electron/utility'는 Electron이 실행 중에 제공한다.
      // Forge 기본 설정은 'electron'만 외부 모듈로 두므로, 빼 두지 않으면 빌드가 실패한다
      external: ['electron/utility'],
    },
  },
});
