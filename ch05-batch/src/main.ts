import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { IPC } from './shared/ipc';
import type { RenameRule } from './shared/rename';
import { cancel, forget, pickFolder, start } from './main/batch';

if (started) {
  app.quit();
}

const createWindow = () => {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs') },
  });
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
  win.on('closed', () => forget(win));
};

// 규칙 객체를 검증한다. 형식이 맞지 않으면 null
function parseRule(value: unknown): RenameRule | null {
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

ipcMain.handle(IPC.pickFolder, (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win ? pickFolder(win) : null;
});

ipcMain.handle(IPC.start, (event, rule: unknown, slow: unknown) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const parsed = parseRule(rule);
  if (!win || !parsed) {
    return {
      renamed: 0,
      canceled: false,
      rolledBack: false,
      errors: ['잘못된 요청'],
    };
  }
  return start(win, parsed, slow === true);
});

ipcMain.on(IPC.cancel, (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) cancel(win);
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
