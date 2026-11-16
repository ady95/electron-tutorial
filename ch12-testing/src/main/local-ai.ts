// Local AI Handler 프로세스를 띄우고 세션에 등록한다 (11-4, 실험 기능)
import { app, session, utilityProcess, type UtilityProcess } from 'electron';
import path from 'node:path';
import type { LocalAiConfig } from '../ai-handler';
import { currentBaseUrl } from './providers';
import { appOrigin } from './security';
import { getSettings } from './settings';

let proc: UtilityProcess | null = null;
let restarts: number[] = []; // 최근 재시작 시각. 바로 죽는 경우 무한 재시작을 막는다
let quitting = false;
app.on('before-quit', () => {
  quitting = true;
});

// 지금 설정으로 핸들러에 보낼 값
function currentConfig(): LocalAiConfig {
  const { providers, local } = getSettings().llm;
  return {
    baseUrl: currentBaseUrl('ollama'),
    model: providers.ollama.model || process.env.OLLAMA_MODEL?.trim() || '',
    numCtx: local.numCtx,
    appOrigin: appOrigin(),
  };
}

export function startLocalAi() {
  proc = utilityProcess.fork(path.join(__dirname, 'ai-handler.cjs'), [], {
    serviceName: 'Local AI Handler',
    stdio: 'pipe',
  });
  proc.stdout?.on('data', (d) => process.stdout.write(d));
  proc.stderr?.on('data', (d) => process.stderr.write(d));
  proc.postMessage(currentConfig());
  // 이 세션(앱 화면)의 Prompt API 요청을 이 프로세스가 처리한다.
  // 핸들러를 등록하지 않은 세션에서는 LanguageModel.availability()가 'unavailable'이다
  session.defaultSession.registerLocalAIHandler(proc);
  proc.once('exit', (code) => {
    proc = null;
    if (quitting) return;
    const now = Date.now();
    restarts = restarts.filter((t) => now - t < 60_000);
    if (restarts.length >= 3) {
      console.error(
        `[Local AI] 1분 안에 3번 종료되어 다시 시작하지 않습니다 (code ${code}).`,
      );
      return;
    }
    restarts.push(now);
    console.warn(`[Local AI] 종료됨 (code ${code}). 다시 시작합니다.`);
    setTimeout(startLocalAi, 1000);
  });
}

// 12-1: 앱을 켤 때가 아니라 Prompt API 화면을 처음 열 때 시작한다 (쓰지 않으면 메모리를 차지하지 않게)
export function ensureLocalAi() {
  if (!proc) startLocalAi();
}

// 설정을 바꾸면 핸들러에 다시 알린다
export function updateLocalAi() {
  proc?.postMessage(currentConfig());
}
