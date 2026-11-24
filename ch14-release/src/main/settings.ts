import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  NUM_CTX_CHOICES,
  PROVIDER_IDS,
  type LocalOptions,
  type LlmSettings,
  type ProviderId,
  type ProviderSettings,
} from '../shared/ipc';
import { log } from './log';

export interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

export interface Settings {
  version: 1;
  window: WindowBounds;
  llm: LlmSettings;
}

const emptyProviders = () =>
  Object.fromEntries(
    PROVIDER_IDS.map((id) => [id, { baseUrl: '', model: '' }]),
  ) as Record<ProviderId, ProviderSettings>;

const DEFAULTS: Settings = {
  version: 1,
  window: { width: 1000, height: 760 },
  llm: {
    active: 'openai',
    providers: emptyProviders(),
    // Ollama 기본값(4096) 대신 넉넉하게. 추론은 꺼 둔다 (11-3 실측: 켜면 짧은 질문에도 40초 넘게 생각한다)
    local: { numCtx: 16384, think: false },
  },
};

const file = () => path.join(app.getPath('userData'), 'settings.json');

let current: Settings = structuredClone(DEFAULTS);

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

// 서버 주소는 비워 두거나 http(s) 주소여야 한다
function parseProvider(value: unknown): ProviderSettings | null {
  if (!isObject(value)) return null;
  if (typeof value.baseUrl !== 'string' || typeof value.model !== 'string') {
    return null;
  }
  const baseUrl = value.baseUrl.trim();
  const model = value.model.trim();
  if (baseUrl.length > 300 || model.length > 100) return null;
  if (baseUrl !== '') {
    try {
      const { protocol } = new URL(baseUrl);
      if (protocol !== 'http:' && protocol !== 'https:') return null;
    } catch {
      return null;
    }
  }
  return { baseUrl, model };
}

function parseLocal(value: unknown): LocalOptions {
  const fallback = DEFAULTS.llm.local;
  if (!isObject(value)) return { ...fallback };
  return {
    numCtx: NUM_CTX_CHOICES.includes(value.numCtx as number)
      ? (value.numCtx as number)
      : fallback.numCtx,
    think: typeof value.think === 'boolean' ? value.think : fallback.think,
  };
}

// 파일이나 Renderer에서 온 값은 믿지 않고 하나씩 검사한다. 이상한 값은 null
export function parseLlmSettings(value: unknown): LlmSettings | null {
  if (!isObject(value) || !isObject(value.providers)) return null;
  if (!PROVIDER_IDS.includes(value.active as ProviderId)) return null;
  const providers = emptyProviders();
  for (const id of PROVIDER_IDS) {
    const p = parseProvider(value.providers[id] ?? { baseUrl: '', model: '' });
    if (!p) return null;
    providers[id] = p;
  }
  return {
    active: value.active as ProviderId,
    providers,
    local: parseLocal(value.local),
  };
}

function parseBounds(value: unknown): WindowBounds | null {
  if (!isObject(value)) return null;
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  if (!num(value.width) || !num(value.height)) return null;
  return {
    x: num(value.x) ? (value.x as number) : undefined,
    y: num(value.y) ? (value.y as number) : undefined,
    width: Math.max(600, value.width as number),
    height: Math.max(400, value.height as number),
  };
}

export function loadSettings(): Settings {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      // 손상된 파일은 지우지 않고 옆에 보관한 뒤 기본값으로 시작한다
      try {
        fs.renameSync(file(), `${file()}.broken-${Date.now()}`);
      } catch {
        // 보관에 실패해도 앱은 기본값으로 계속 실행한다
      }
      log.warn(
        `설정 파일을 읽지 못해 기본값을 씁니다: ${(err as Error).message}`,
      );
    }
    current = structuredClone(DEFAULTS);
    return current;
  }
  const s = isObject(raw) ? raw : {};
  current = {
    version: 1,
    window: parseBounds(s.window) ?? DEFAULTS.window,
    llm: parseLlmSettings(s.llm) ?? structuredClone(DEFAULTS.llm),
  };
  return current;
}

export function getSettings(): Settings {
  return current;
}

// 임시 파일에 쓴 뒤 이름을 바꾼다. 쓰는 도중 앱이 꺼져도 기존 파일이 깨지지 않는다
export function saveSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  const target = file();
  const tmp = `${target}.tmp`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(current, null, 2), 'utf8');
  fs.renameSync(tmp, target);
}
