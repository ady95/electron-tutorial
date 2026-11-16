import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { IPC } from './shared/ipc';
import {
  getSettings,
  loadSettings,
  parseLlmSettings,
  saveSettings,
} from './main/settings';
import {
  analyze,
  getLlmSettingsView,
  parseAnalyzeRequest,
} from './main/analysis';
import {
  getDocument,
  importDropped,
  listDocuments,
  openWithDialog,
  parseDropped,
  removeDocument,
} from './main/documents';
import { clearApiKey, getStatus, saveApiKey } from './main/secrets';
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

const isId = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v > 0;

// --- 문서 ---
handle(IPC.openDocuments, (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win ? openWithDialog(win) : { added: [], errors: [] };
});

handle(IPC.importDocuments, (_event, value: unknown) => {
  const files = parseDropped(value);
  if (!files)
    return { added: [], errors: [{ name: '', message: '잘못된 요청' }] };
  return importDropped(files);
});

handle(IPC.listDocuments, () => listDocuments());

handle(IPC.getDocument, (_event, id: unknown) =>
  isId(id) ? getDocument(id) : null,
);

handle(IPC.removeDocument, (_event, id: unknown) =>
  isId(id) ? removeDocument(id) : false,
);

// --- LLM ---
handle(IPC.getLlmSettings, () => getLlmSettingsView());

handle(IPC.saveLlmSettings, (_event, value: unknown) => {
  const llm = parseLlmSettings(value);
  if (!llm) return false;
  saveSettings({ llm });
  return true;
});

handle(IPC.analyze, (event, value: unknown) => {
  const req = parseAnalyzeRequest(value);
  if (!req) return { ok: false, message: '잘못된 요청' };
  return analyze(event.sender, req);
});

// --- API 키 (6장) ---
handle(IPC.secretStatus, () => getStatus());

handle(IPC.saveSecret, (_event, value: unknown) => {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 500) {
    return { ok: false, message: '키 형식이 올바르지 않습니다.' };
  }
  return saveApiKey(value.trim());
});

handle(IPC.clearSecret, () => clearApiKey());

on(IPC.openDataFolder, () => {
  shell.openPath(app.getPath('userData'));
});

app.whenReady().then(() => {
  loadSettings();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
