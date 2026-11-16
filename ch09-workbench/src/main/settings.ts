import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { LlmSettings } from '../shared/ipc';

export interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

export interface Settings {
  version: 1;
  window: WindowBounds;
  llm: LlmSettings; // 빈 문자열이면 환경 변수 값을 쓴다
}

const DEFAULTS: Settings = {
  version: 1,
  window: { width: 1200, height: 800 },
  llm: { baseUrl: '', model: '' },
};

const file = () => path.join(app.getPath('userData'), 'settings.json');

let current: Settings = structuredClone(DEFAULTS);

// 파일이나 Renderer에서 온 값은 믿지 않고 하나씩 검사한다. 이상한 값은 null
export function parseLlmSettings(value: unknown): LlmSettings | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.baseUrl !== 'string' || typeof v.model !== 'string') return null;
  const baseUrl = v.baseUrl.trim();
  const model = v.model.trim();
  if (baseUrl.length > 300 || model.length > 100) return null;
  // 주소는 비워 두거나 http(s) 주소여야 한다
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

function parseBounds(value: unknown): WindowBounds | null {
  if (typeof value !== 'object' || value === null) return null;
  const b = value as Record<string, unknown>;
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  if (!num(b.width) || !num(b.height)) return null;
  return {
    x: num(b.x) ? (b.x as number) : undefined,
    y: num(b.y) ? (b.y as number) : undefined,
    width: Math.max(600, b.width as number),
    height: Math.max(400, b.height as number),
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
      const broken = `${file()}.broken-${Date.now()}`;
      try {
        fs.renameSync(file(), broken);
      } catch {
        // 보관에 실패해도 앱은 기본값으로 계속 실행한다
      }
      console.warn(
        `설정 파일을 읽지 못해 기본값을 씁니다: ${(err as Error).message}`,
      );
    }
    current = structuredClone(DEFAULTS);
    return current;
  }
  const s = (raw ?? {}) as Record<string, unknown>;
  current = {
    version: 1,
    window: parseBounds(s.window) ?? DEFAULTS.window,
    llm: parseLlmSettings(s.llm) ?? DEFAULTS.llm,
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
