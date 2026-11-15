import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { IPC } from './shared/ipc';
import {
  forgetWindow,
  openDropped,
  openWithDialog,
  resetPath,
  save,
} from './main/files';
import { buildMenu } from './main/menu';

if (started) {
  app.quit();
}

// 창마다 "저장하지 않은 변경이 있는가"를 기억한다 (닫기 확인용)
const dirtyWindows = new Set<number>();

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

  // 저장하지 않은 내용이 있으면 닫기 전에 확인한다
  mainWindow.on('close', (event) => {
    if (!dirtyWindows.has(mainWindow.id)) return;
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      buttons: ['저장하지 않고 닫기', '취소'],
      defaultId: 1,
      cancelId: 1,
      message: '저장하지 않은 내용이 있습니다.',
      detail: '닫으면 변경 내용이 사라집니다.',
    });
    if (choice === 1) event.preventDefault();
  });

  const id = mainWindow.id;
  mainWindow.on('closed', () => {
    dirtyWindows.delete(id);
    forgetWindow(mainWindow);
  });
};

// 요청을 보낸 창을 찾는다. 창이 없으면 null
const senderWindow = (
  event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent,
) => BrowserWindow.fromWebContents(event.sender);

ipcMain.on(IPC.setTitle, (event, title: unknown) => {
  if (typeof title !== 'string') return;
  senderWindow(event)?.setTitle(title.slice(0, 200));
});

ipcMain.on(IPC.setDirty, (event, dirty: unknown) => {
  const win = senderWindow(event);
  if (!win) return;
  if (dirty === true) dirtyWindows.add(win.id);
  else dirtyWindows.delete(win.id);
  win.setDocumentEdited(dirty === true); // macOS: 닫기 버튼에 점 표시
});

ipcMain.handle(IPC.openFile, (event) => {
  const win = senderWindow(event);
  return win ? openWithDialog(win) : { ok: false, reason: 'canceled' };
});

ipcMain.handle(IPC.openDroppedFile, (event, filePath: unknown) => {
  const win = senderWindow(event);
  return win ? openDropped(win, filePath) : { ok: false, reason: 'canceled' };
});

ipcMain.handle(IPC.saveFile, (event, text: unknown, saveAs: unknown) => {
  const win = senderWindow(event);
  return win ? save(win, text, saveAs) : { ok: false, reason: 'canceled' };
});

// 새 문서: Renderer가 상태를 비우고, Main은 기억한 경로를 잊는다
ipcMain.on(IPC.resetFile, (event) => {
  const win = senderWindow(event);
  if (win) resetPath(win);
});

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
