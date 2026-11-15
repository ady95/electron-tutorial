import { app, BrowserWindow, ipcMain } from 'electron';
import os from 'node:os';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { IPC, type SystemInfo } from './shared/ipc';

// Windows 설치·제거 시 바로가기 처리 (13장에서 다룸)
if (started) {
  app.quit();
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 650,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Main → Renderer: 1초마다 현재 시각을 보낸다
  const timer = setInterval(() => {
    mainWindow.webContents.send(IPC.clockTick, new Date().toLocaleTimeString());
  }, 1000);
  mainWindow.on('closed', () => clearInterval(timer));
};

// Renderer → Main 요청-응답 (invoke ↔ handle)
ipcMain.handle(IPC.getSystemInfo, (): SystemInfo => {
  const cpus = os.cpus();
  return {
    platform: process.platform,
    arch: process.arch,
    osVersion: os.release(),
    cpuModel: cpus[0]?.model ?? 'unknown',
    cpuCount: cpus.length,
    totalMemoryGB: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    versions: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    },
  };
});

// Renderer → Main 단방향 (send ↔ on)
ipcMain.on(IPC.logMessage, (_event, message: unknown) => {
  if (typeof message !== 'string') return;
  console.log(`[renderer] ${message.slice(0, 200)}`);
});

app.whenReady().then(() => {
  createWindow();

  // macOS: Dock 아이콘을 눌렀는데 창이 없으면 새로 만든다
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// macOS가 아니면 창을 모두 닫을 때 앱 종료
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
