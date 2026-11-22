// 12-1: 측정 모듈을 가장 먼저 불러 "Main 코드를 읽기 시작한 시점"을 기록한다
import { mark, report } from './main/perf';
import { app, BrowserWindow, shell } from 'electron';
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
import { setupCrashHandling } from './main/crash';
import { log, logDir } from './main/log';
import { ensureLocalAi, updateLocalAi } from './main/local-ai';
import { listChatModels } from './main/ollama';
import { notifyAnswerDone } from './main/notify';
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

// 12-4: 배포본이 원격 디버깅 스위치로 실행되면 바로 끝낸다.
// (12-3 실측: Fuse로 Node 디버거를 막아도 --remote-debugging-port로는 화면과 window.api를 조작할 수 있었다)
if (
  app.isPackaged &&
  ['remote-debugging-port', 'remote-debugging-pipe'].some((s) =>
    app.commandLine.hasSwitch(s),
  )
) {
  app.exit(1);
}

// 12-4: 크래시 기록과 예상하지 못한 오류 처리. 가능한 한 일찍 건다
setupCrashHandling();

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
  mark('window-create');
  const win = new BrowserWindow({
    ...bounds,
    // 12-1: 첫 화면이 그려진 뒤에 보여 준다 (빈 흰 창이 먼저 뜨지 않게)
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // 12-4: 배포본에서는 개발자 도구를 열 수 없게 한다
      devTools: !app.isPackaged,
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
  win.webContents.once('did-finish-load', () => mark('did-finish-load'));
  win.once('ready-to-show', () => {
    mark('ready-to-show');
    win.show();
    // 화면이 자리 잡은 뒤의 메모리를 잰다
    setTimeout(() => report('startup'), 2000);
  });
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
    log.error('[Ollama] 모델 목록', err);
    return {
      ok: false,
      message: 'Ollama에 연결하지 못했습니다. Ollama가 실행 중인지 확인하세요.',
    };
  }
});

handle(IPC.enableLocalAi, () => ensureLocalAi());

// --- 오류 기록 (12-4) ---
// 화면에서 보낸 오류 문장은 믿지 않는 입력이다. 문자열만, 길이를 잘라 기록한다
on(IPC.reportError, (_event, message: unknown) => {
  if (typeof message !== 'string') return;
  log.error('[Renderer]', message.slice(0, 5000));
});

handle(IPC.openLogs, async () => {
  await shell.openPath(logDir());
});

// --- 대화 ---
// Renderer가 MessagePort를 함께 보낸다. 포트가 없으면 응답을 돌려줄 곳이 없으니 무시한다
on(IPC.startChat, (event, request: unknown) => {
  const [port] = event.ports;
  const win = BrowserWindow.fromWebContents(event.sender);
  if (port) startChat(port, request, () => notifyAnswerDone(win));
});

app.whenReady().then(() => {
  mark('ready');
  loadSettings();
  createWindow();
  // 11-4의 Local AI Handler는 여기서 시작하지 않는다. Prompt API 화면이 열릴 때 시작한다 (12-1)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
