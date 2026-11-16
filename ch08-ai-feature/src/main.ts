import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { IPC, type BatchResult, type ExportResult } from './shared/ipc';
import { cancel, forget, pickFolder, start } from './main/batch';
import {
  getSettings,
  loadSettings,
  parseRule,
  saveSettings,
} from './main/settings';
import {
  addJob,
  clearJobs,
  closeHistory,
  exportJobs,
  openHistory,
  searchJobs,
} from './main/history';
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

const createWindow = () => {
  // 지난번 창 크기와 위치로 연다
  const { window: bounds } = getSettings();
  const win = new BrowserWindow({
    ...bounds,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      // Electron 45의 기본값이지만, 의도를 드러내기 위해 명시한다
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
  // 닫히기 직전의 크기와 위치를 저장한다 (최대화 상태라면 원래 크기를 저장)
  win.on('close', () => {
    if (!win.isMinimized()) saveSettings({ window: win.getNormalBounds() });
  });
  win.on('closed', () => forget(win));
};

const fail = (message: string): BatchResult => ({
  renamed: 0,
  canceled: false,
  rolledBack: false,
  errors: [message],
});

handle(IPC.pickFolder, (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win ? pickFolder(win) : null;
});

handle(IPC.start, (event, rule: unknown, slow: unknown) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const parsed = parseRule(rule);
  if (!win || !parsed) return fail('잘못된 요청');
  return start(win, parsed, slow === true, (job) => {
    try {
      addJob(job);
    } catch (err) {
      console.error('이력 저장 실패', err); // 이력 저장 실패가 작업 결과를 바꾸지는 않는다
    }
  });
});

on(IPC.cancel, (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) cancel(win);
});

handle(IPC.getSettings, () => {
  const { rule, slow } = getSettings();
  return { rule, slow };
});

handle(IPC.saveSettings, (_event, value: unknown) => {
  const v = (value ?? {}) as Record<string, unknown>;
  const rule = parseRule(v.rule);
  if (!rule) return false;
  saveSettings({ rule, slow: v.slow === true });
  return true;
});

handle(IPC.searchHistory, (_event, query: unknown) => {
  if (typeof query !== 'string' || query.length > 100) return [];
  return searchJobs(query);
});

handle(IPC.clearHistory, () => clearJobs());

// Renderer는 검색어만 보낸다. 저장 경로는 Main이 대화상자로 정한다
handle(IPC.exportHistory, (event, query: unknown): Promise<ExportResult> => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || typeof query !== 'string' || query.length > 100) {
    return Promise.resolve({ status: 'failed', message: '잘못된 요청' });
  }
  return exportJobs(win, query);
});

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
  openHistory();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => closeHistory());
