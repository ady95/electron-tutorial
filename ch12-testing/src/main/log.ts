// 앱 로그 (12-4). 사용자 데이터 폴더의 logs/main.log에 한 줄에 하나씩 JSON으로 쓴다.
// 사용자가 "오류가 났어요"라고 할 때 이 파일을 받아 원인을 찾는다. 그래서 비밀은 쓰기 전에 가린다
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { redact } from '../shared/redact';

const MAX_BYTES = 1024 * 1024; // 1MB를 넘으면 main.old.log로 바꾸고 새로 쓴다

export const logDir = () => path.join(app.getPath('userData'), 'logs');
const logFile = () => path.join(logDir(), 'main.log');

type Level = 'info' | 'warn' | 'error';

function format(value: unknown): string {
  if (value instanceof Error)
    return `${value.name}: ${value.message}\n${value.stack ?? ''}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function write(level: Level, parts: unknown[]) {
  const message = redact(parts.map(format).join(' ')).slice(0, 10_000);
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    message,
  });
  // 개발 중에는 터미널에서도 보이게 한다
  (level === 'error'
    ? console.error
    : level === 'warn'
      ? console.warn
      : console.log)(`[${level}] ${message}`);
  try {
    fs.mkdirSync(logDir(), { recursive: true });
    const file = logFile();
    if (fs.existsSync(file) && fs.statSync(file).size > MAX_BYTES) {
      fs.renameSync(file, path.join(logDir(), 'main.old.log'));
    }
    // 동기 쓰기: 크래시 직전의 기록도 남기기 위해서다
    fs.appendFileSync(file, line + '\n', 'utf8');
  } catch {
    // 로그를 못 써도 앱은 계속 실행한다
  }
}

export const log = {
  info: (...parts: unknown[]) => write('info', parts),
  warn: (...parts: unknown[]) => write('warn', parts),
  error: (...parts: unknown[]) => write('error', parts),
};
