import {
  app,
  BrowserWindow,
  Menu,
  type MenuItemConstructorOptions,
} from 'electron';
import { IPC, type MenuCommand } from '../shared/ipc';

// 메뉴 항목을 누르면 포커스된 창의 Renderer에 명령을 보낸다
const send = (command: MenuCommand) => () => {
  BrowserWindow.getFocusedWindow()?.webContents.send(IPC.menuCommand, command);
};

export function buildMenu() {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    // macOS에서는 첫 메뉴가 앱 이름 메뉴가 된다
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: '파일',
      submenu: [
        { label: '새 문서', accelerator: 'CmdOrCtrl+N', click: send('new') },
        { label: '열기...', accelerator: 'CmdOrCtrl+O', click: send('open') },
        { type: 'separator' },
        { label: '저장', accelerator: 'CmdOrCtrl+S', click: send('save') },
        {
          label: '다른 이름으로 저장...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: send('save-as'),
        },
        { type: 'separator' },
        isMac
          ? { role: 'close', label: '창 닫기' }
          : { role: 'quit', label: '끝내기' },
      ],
    },
    { role: 'editMenu', label: '편집' },
    { role: 'viewMenu', label: '보기' },
    { role: 'windowMenu', label: '창' },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  return app.applicationMenu;
}
