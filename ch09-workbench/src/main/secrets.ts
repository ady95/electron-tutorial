import { app, safeStorage } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { SecretStatus } from '../shared/ipc';

// 암호화한 값만 파일에 저장한다. 평문 API 키는 디스크에 쓰지 않는다
const file = () => path.join(app.getPath('userData'), 'secrets.json');

interface SecretFile {
  apiKey?: string; // 암호문을 base64로 저장
  origin?: string; // 이 키를 보낼 서버 (예: https://api.openai.com). 비밀이 아니므로 평문
}

async function readFile(): Promise<SecretFile> {
  try {
    return JSON.parse(await fs.readFile(file(), 'utf8')) as SecretFile;
  } catch {
    return {};
  }
}

async function writeFile(data: SecretFile) {
  const tmp = `${file()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data), 'utf8');
  await fs.rename(tmp, file());
}

// 키는 저장할 때의 서버 주소(origin)와 함께 저장한다. 다른 서버로는 보내지 않기 위해서다
export async function saveApiKey(value: string, origin: string) {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    return {
      ok: false,
      message: '이 컴퓨터에서는 OS 암호화를 쓸 수 없습니다.',
    };
  }
  const encrypted = await safeStorage.encryptStringAsync(value);
  await writeFile({
    ...(await readFile()),
    apiKey: encrypted.toString('base64'),
    origin,
  });
  return { ok: true };
}

// Main 안에서만 쓴다. Renderer로는 보내지 않는다
export async function loadApiKey(): Promise<{
  key: string;
  origin: string;
} | null> {
  const { apiKey, origin = '' } = await readFile();
  if (!apiKey) return null;
  const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(
    Buffer.from(apiKey, 'base64'),
  );
  // OS가 암호화 키를 바꾼 경우 새 키로 다시 암호화해 둔다
  if (shouldReEncrypt) await saveApiKey(result, origin);
  return { key: result, origin };
}

export async function getStatus(): Promise<SecretStatus> {
  const available = await safeStorage.isAsyncEncryptionAvailable();
  let saved: { key: string; origin: string } | null = null;
  try {
    saved = await loadApiKey();
  } catch {
    saved = null; // 다른 PC에서 복사해 온 파일 등은 복호화할 수 없다
  }
  return {
    available,
    saved: saved !== null,
    last4: saved ? saved.key.slice(-4) : null,
    origin: saved?.origin ?? null,
  };
}

export async function clearApiKey() {
  const data = await readFile();
  delete data.apiKey;
  delete data.origin;
  await writeFile(data);
}
