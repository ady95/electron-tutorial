import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { IPC, PROVIDER_IDS, type ProviderId } from './shared/ipc';
import {
  getSettings,
  loadSettings,
  parseLlmSettings,
  saveSettings,
} from './main/settings';
import { setTimeoutForDev, startChat } from './main/chat';
import { startLocalAi, updateLocalAi } from './main/local-ai';
import { listChatModels } from './main/ollama';
import { currentBaseUrl, defaultsView, originOf } from './main/providers';
import { clearKey, keyStatus, saveKey } from './main/secrets';
import {
  applySecurity,
  handle,
  on,
  rendererFileUrl,
  setAppUrl,
} from './main/security';

if (started) {
  app.quit();
}

// 창을 만들기 전에(ready 전에) 보안 설정을 건다
applySecurity();

// 개발 중에는 프로젝트 폴더의 .env를 환경 변수로 읽는다 (Node.js 내장 기능).
// 배포한 앱에서는 읽지 않는다. 사용자는 설정 화면에서 값을 넣는다
if (!app.isPackaged) {
  try {
    process.loadEnvFile(path.join(app.getAppPath(), '.env'));
  } catch {
    // .env가 없으면 그냥 넘어간다
  }
  setTimeoutForDev(Number(process.env.CHAT_LLM_TIMEOUT_MS ?? 0));
}

const createWindow = () => {
  const { window: bounds } = getSettings();
  const win = new BrowserWindow({
    ...bounds,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    setAppUrl(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    const indexHtml = path.join(
      __dirname,
      `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
    );
    setAppUrl(rendererFileUrl(indexHtml));
    win.loadFile(indexHtml);
  }
  win.on('close', () => {
    if (!win.isMinimized()) saveSettings({ window: win.getNormalBounds() });
  });
};

const isProvider = (v: unknown): v is ProviderId =>
  PROVIDER_IDS.includes(v as ProviderId);

// --- 설정 ---
handle(IPC.getSettings, () => ({
  saved: getSettings().llm,
  defaults: defaultsView(),
}));

handle(IPC.saveSettings, (_event, value: unknown) => {
  const llm = parseLlmSettings(value);
  if (!llm) return false;
  saveSettings({ llm });
  updateLocalAi(); // 11-4: 핸들러도 새 모델·컨텍스트를 쓰게 한다
  return true;
});

// --- API 키 ---
handle(IPC.secretStatus, (_event, id: unknown) =>
  isProvider(id) ? keyStatus(id) : null,
);

handle(IPC.saveSecret, (_event, id: unknown, value: unknown) => {
  if (!isProvider(id)) return { ok: false, message: '잘못된 요청' };
  if (typeof value !== 'string' || value.trim() === '' || value.length > 500) {
    return { ok: false, message: '키 형식이 올바르지 않습니다.' };
  }
  // 키는 지금 설정된 서버에만 보내도록 서버 주소와 함께 저장한다
  const origin = originOf(currentBaseUrl(id));
  if (!origin) return { ok: false, message: '서버 주소를 먼저 저장하세요.' };
  return saveKey(id, value.trim(), origin);
});

handle(IPC.clearSecret, (_event, id: unknown) =>
  isProvider(id) ? clearKey(id) : undefined,
);

// --- 로컬 모델 (11-3) ---
handle(IPC.listLocalModels, async () => {
  try {
    return { ok: true, models: await listChatModels(currentBaseUrl('ollama')) };
  } catch (err) {
    console.error('[Ollama] 모델 목록', err);
    return {
      ok: false,
      message: 'Ollama에 연결하지 못했습니다. Ollama가 실행 중인지 확인하세요.',
    };
  }
});

// --- 대화 ---
// Renderer가 MessagePort를 함께 보낸다. 포트가 없으면 응답을 돌려줄 곳이 없으니 무시한다
on(IPC.startChat, (event, request: unknown) => {
  const [port] = event.ports;
  if (port) startChat(port, request);
});

app.whenReady().then(() => {
  loadSettings();
  createWindow();
  startLocalAi(); // 11-4: 앱 화면의 출처가 정해진 뒤(createWindow 뒤)에 시작한다
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
