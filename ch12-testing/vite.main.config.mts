import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig(({ mode }) => ({
  build: {
    // 12-4: 개발 중(npm start)에만 소스맵을 만든다. 디버거의 중단점이 TypeScript 원본 줄에 걸린다.
    // 배포본(npm run package)에는 넣지 않는다 (원본 코드가 그대로 드러나고 용량이 늘어난다)
    sourcemap: mode === 'development',
    rollupOptions: {
      // 11-4: UtilityProcess에서 쓰는 'electron/utility'는 Electron이 실행 중에 제공한다.
      // Forge 기본 설정은 'electron'만 외부 모듈로 두므로, 빼 두지 않으면 빌드가 실패한다
      external: ['electron/utility'],
    },
  },
}));
