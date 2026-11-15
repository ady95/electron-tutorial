// Main과 Preload가 함께 쓰는 IPC 채널 이름과 API 타입

export const IPC = {
  setTitle: 'window:set-title',
} as const;

export interface ExposedApi {
  setTitle: (title: string) => void;
}
