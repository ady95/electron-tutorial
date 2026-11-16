import type { ProviderId } from '../shared/ipc';

// 화면에 보여 줄 요청 경로 이름과 자격 증명 이름
export const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: 'OpenAI 호환 (내 API 키)',
  proxy: '회사 중계 서버',
};

export const KEY_LABELS: Record<ProviderId, string> = {
  openai: 'API 키',
  proxy: '사용자 토큰',
};
