import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { IPC } from './shared/ipc';
import {
  cancelReport,
  openReport,
  pythonStatus,
  runReport,
  selectInput,
  stopPython,
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

handle(IPC.pythonStatus, () => pythonStatus());

handle(IPC.selectInput, (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win ? selectInput(win) : null;
});

handle(IPC.runReport, (event, requestId: unknown) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || typeof requestId !== 'string' || requestId.length > 100) {
    return { ok: false, code: 'bad-request', message: '잘못된 요청' };
  }
  return runReport(win, event.sender, requestId);
});

on(IPC.cancelReport, (_event, requestId: unknown) => cancelReport(requestId));

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

// 앱이 끝날 때 Python 작업자도 끝낸다
app.on('will-quit', () => stopPython());
