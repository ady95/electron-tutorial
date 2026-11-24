// 요청 경로 결정 테스트 (12-2): "키는 그 키를 받기로 한 서버에만" 규칙
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LlmSettings } from '../shared/ipc';
import { resolveProvider } from './providers';
import { loadKey } from './secrets';

let llm: LlmSettings;
vi.mock('./settings', () => ({ getSettings: () => ({ llm }) }));
vi.mock('./secrets', () => ({ loadKey: vi.fn() }));

const empty = { baseUrl: '', model: '' };

beforeEach(() => {
  llm = {
    active: 'openai',
    providers: {
      openai: { ...empty },
      proxy: { ...empty },
      ollama: { ...empty },
    },
    local: { numCtx: 16384, think: false },
  };
  vi.mocked(loadKey).mockReset().mockResolvedValue(null);
  vi.stubEnv('OPENAI_BASE_URL', 'https://api.openai.com/v1');
  vi.stubEnv('OPENAI_MODEL', 'env-model');
  vi.stubEnv('OPENAI_API_KEY', 'sk-env');
});
afterEach(() => vi.unstubAllEnvs());

describe('resolveProvider', () => {
  it('주소·모델·키가 모두 환경 변수면 환경 변수의 키를 쓴다', async () => {
    expect(await resolveProvider('openai')).toMatchObject({
      baseUrl: 'https://api.openai.com/v1',
      model: 'env-model',
      apiKey: 'sk-env',
    });
  });

  it('설정 화면에서 주소만 바꾸면 환경 변수의 키를 보내지 않는다', async () => {
    llm.providers.openai.baseUrl = 'https://other.example.com/v1';
    expect(await resolveProvider('openai')).toMatchObject({ apiKey: '' });
  });

  it('저장한 키는 저장할 때의 서버에만 쓴다', async () => {
    vi.mocked(loadKey).mockResolvedValue({
      key: 'sk-saved',
      origin: 'https://api.openai.com',
    });
    expect(await resolveProvider('openai')).toMatchObject({
      apiKey: 'sk-saved',
    });

    llm.providers.openai.baseUrl = 'https://other.example.com/v1';
    expect(await resolveProvider('openai')).toEqual(
      expect.stringContaining('https://api.openai.com용입니다'),
    );
  });

  it('복호화할 수 없는 키는 없는 것으로 본다', async () => {
    vi.mocked(loadKey).mockRejectedValue(new Error('decrypt failed'));
    expect(await resolveProvider('openai')).toMatchObject({ apiKey: 'sk-env' });
  });

  it('Ollama는 키를 보내지 않고, 주소가 없으면 localhost:11434', async () => {
    llm.providers.ollama.model = 'qwen3.5:9b';
    vi.mocked(loadKey).mockResolvedValue({
      key: 'sk-saved',
      origin: 'http://localhost:11434',
    });
    expect(await resolveProvider('ollama')).toEqual({
      id: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'qwen3.5:9b',
      apiKey: '',
    });
  });

  it('모델이 없으면 안내 문장', async () => {
    vi.stubEnv('OPENAI_MODEL', '');
    expect(await resolveProvider('openai')).toBe(
      '모델 이름이 없습니다. 설정에서 입력하세요.',
    );
  });
});
