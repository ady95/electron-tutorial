import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { UserSettings } from '../shared/ipc';
import type { RenameRule } from '../shared/rename';

export interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

export interface Settings extends UserSettings {
  version: 1;
  window: WindowBounds;
}

const DEFAULTS: Settings = {
  version: 1,
  rule: { prefix: '사진_', start: 1, digits: 3, extFilter: '' },
  slow: false,
  window: { width: 900, height: 700 },
};

const file = () => path.join(app.getPath('userData'), 'settings.json');

let current: Settings = structuredClone(DEFAULTS);

// 파일에서 읽은 값은 믿지 않고 하나씩 검사한다. 이상한 값은 기본값으로
export function parseRule(value: unknown): RenameRule | null {
  if (typeof value !== 'object' || value === null) return null;
  const r = value as Record<string, unknown>;
  if (typeof r.prefix !== 'string' || r.prefix.length > 100) return null;
  if (typeof r.start !== 'number' || typeof r.digits !== 'number') return null;
  if (typeof r.extFilter !== 'string' || r.extFilter.length > 20) return null;
  return {
    prefix: r.prefix,
    start: r.start,
    digits: r.digits,
    extFilter: r.extFilter,
  };
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
    rule: parseRule(s.rule) ?? DEFAULTS.rule,
    slow: s.slow === true,
    window: parseBounds(s.window) ?? DEFAULTS.window,
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
