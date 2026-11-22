// 어느 서버로, 어떤 자격 증명을 들고 요청할지 정한다 (요청 경로)
import type { ProviderId, SettingsView } from '../shared/ipc';
import type { OpenAiConfig } from './openai';
import { loadKey } from './secrets';
import { getSettings } from './settings';

const env = (name: string) => process.env[name]?.trim() ?? '';

// 개발 중 .env에서 읽을 환경 변수 이름
const ENV_NAMES: Record<
  ProviderId,
  { baseUrl: string; model: string; key: string }
> = {
  openai: {
    baseUrl: 'OPENAI_BASE_URL',
    model: 'OPENAI_MODEL',
    key: 'OPENAI_API_KEY',
  },
  // 회사 중계 서버: 키 자리에 "사용자 토큰"이 들어간다. 진짜 API 키는 서버에만 있다
  proxy: {
    baseUrl: 'CHAT_PROXY_URL',
    model: 'CHAT_PROXY_MODEL',
    key: 'CHAT_PROXY_TOKEN',
  },
  // 내 PC의 Ollama. 키가 없다 (11-3)
  ollama: {
    baseUrl: 'OLLAMA_BASE_URL',
    model: 'OLLAMA_MODEL',
    key: '',
  },
};

// 아무것도 설정하지 않았을 때의 서버 주소
const DEFAULT_BASE_URL: Partial<Record<ProviderId, string>> = {
  ollama: 'http://localhost:11434',
};

export const originOf = (baseUrl: string) => {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return '';
  }
};

export function defaultsView(): SettingsView['defaults'] {
  const view = (id: ProviderId) => ({
    baseUrl: env(ENV_NAMES[id].baseUrl),
    model: env(ENV_NAMES[id].model),
    hasKey: ENV_NAMES[id].key !== '' && env(ENV_NAMES[id].key) !== '',
  });
  return {
    openai: view('openai'),
    proxy: view('proxy'),
    ollama: {
      ...view('ollama'),
      baseUrl: env(ENV_NAMES.ollama.baseUrl) || DEFAULT_BASE_URL.ollama || '',
    },
  };
}

// 지금 쓸 서버 주소. 설정 화면에 저장한 값이 먼저, 비어 있으면 환경 변수
export function currentBaseUrl(id: ProviderId) {
  return (
    getSettings().llm.providers[id].baseUrl ||
    env(ENV_NAMES[id].baseUrl) ||
    DEFAULT_BASE_URL[id] ||
    ''
  );
}

export type ResolvedProvider = { id: ProviderId } & OpenAiConfig;

// 키는 "그 키를 받기로 한 서버"에만 보낸다 (9장 규칙)
//  - 설정 화면에 저장한 키: 저장할 때의 서버 주소(origin)와 지금 주소가 같을 때만
//  - 환경 변수의 키: 서버 주소도 환경 변수에서 왔을 때만
export async function resolveProvider(
  id: ProviderId,
): Promise<ResolvedProvider | string> {
  const saved = getSettings().llm.providers[id];
  const names = ENV_NAMES[id];
  const baseUrl = currentBaseUrl(id);
  const model = saved.model || env(names.model);
  if (!baseUrl) return 'LLM 서버 주소가 없습니다. 설정에서 입력하세요.';
  if (!model) return '모델 이름이 없습니다. 설정에서 입력하세요.';
  if (id === 'ollama') return { id, baseUrl, model, apiKey: '' }; // 로컬 모델은 키가 없다

  const origin = originOf(baseUrl);
  let stored: { key: string; origin: string } | null = null;
  try {
    stored = await loadKey(id);
  } catch {
    stored = null; // 복호화할 수 없는 키 (다른 PC에서 가져온 파일 등)
  }
  let apiKey = '';
  if (stored) {
    if (stored.origin !== origin) {
      return `저장된 키는 ${stored.origin}용입니다. 지금 서버(${origin})에 쓰려면 설정에서 키를 다시 저장하세요.`;
    }
    apiKey = stored.key;
  } else if (!saved.baseUrl) {
    apiKey = env(names.key);
  }
  return { id, baseUrl, model, apiKey };
}
