// Preload가 노출한 window.api의 타입을 Renderer 코드에 알려 준다
import type { ExposedApi } from './shared/ipc';

declare global {
  interface Window {
    api: ExposedApi;
  }
}
