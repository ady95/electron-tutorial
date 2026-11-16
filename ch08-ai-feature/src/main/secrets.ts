import { app, safeStorage } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { SecretStatus } from '../shared/ipc';

// 암호화한 값만 파일에 저장한다. 평문 API 키는 디스크에 쓰지 않는다
const file = () => path.join(app.getPath('userData'), 'secrets.json');

interface SecretFile {
  apiKey?: string; // 암호문을 base64로 저장
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

export async function saveApiKey(value: string) {
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
  });
  return { ok: true };
}

// Main 안에서만 쓴다 (9장에서 LLM API를 호출할 때). Renderer로는 보내지 않는다
export async function loadApiKey(): Promise<string | null> {
  const { apiKey } = await readFile();
  if (!apiKey) return null;
  const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(
    Buffer.from(apiKey, 'base64'),
  );
  // OS가 암호화 키를 바꾼 경우 새 키로 다시 암호화해 둔다
  if (shouldReEncrypt) await saveApiKey(result);
  return result;
}

export async function getStatus(): Promise<SecretStatus> {
  const available = await safeStorage.isAsyncEncryptionAvailable();
  let key: string | null = null;
  try {
    key = await loadApiKey();
  } catch {
    key = null; // 다른 PC에서 복사해 온 파일 등은 복호화할 수 없다
  }
  return { available, saved: key !== null, last4: key ? key.slice(-4) : null };
}

export async function clearApiKey() {
  const data = await readFile();
  delete data.apiKey;
  await writeFile(data);
}
