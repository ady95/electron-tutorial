import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { IPC } from './shared/ipc';
import { getSettings, loadSettings, saveSettings } from './main/settings';
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
