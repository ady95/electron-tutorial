import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { IPC } from './shared/ipc';
import {
  connectWindow,
  openReport,
  selectInput,
  startReport,
  stopHost,
} from './main/report';
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

applySecurity();

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1000,
    height: 760,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  // 화면을 (다시) 불러올 때마다 Python 관리자와 새 통로를 연결한다
  win.webContents.on('did-finish-load', () => connectWindow(win));
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
};

handle(IPC.selectInput, (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win ? selectInput(win) : null;
});

handle(IPC.startReport, (event, jobId: unknown) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || typeof jobId !== 'string' || jobId.length > 100) {
    return { ok: false, code: 'bad-request', message: '잘못된 요청' };
  }
  return startReport(win, jobId);
});

on(IPC.openReport, () => openReport());

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 앱이 끝날 때 Python 관리자와 작업자도 끝낸다
app.on('will-quit', () => stopHost());
