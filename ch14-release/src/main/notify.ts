// 13-2: 창을 보고 있지 않을 때 답변이 끝나면 알림을 띄운다.
// 알림 아이콘은 배포 리소스(extraResource)로 넣은 파일을 읽는다
import { app, BrowserWindow, Notification } from 'electron';
import path from 'node:path';

// 개발 중에는 프로젝트의 assets 폴더, 패키지 앱에서는 resources 폴더
// (forge.config.mts의 extraResource가 assets/icon.png를 resources/icon.png로 복사한다)
export function resourcePath(name: string) {
  return app.isPackaged
    ? path.join(process.resourcesPath, name)
    : path.join(app.getAppPath(), 'assets', name);
}

export function notifyAnswerDone(win: BrowserWindow | null) {
  if (!win || win.isDestroyed() || win.isFocused()) return;
  if (!Notification.isSupported()) return;
  // 답변 내용은 넣지 않는다. 알림은 잠금 화면이나 알림 센터에 남을 수 있다
  const n = new Notification({
    title: '답변이 끝났습니다',
    body: '창으로 돌아가 확인하세요.',
    icon: resourcePath('icon.png'),
  });
  n.on('click', () => {
    if (win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
  n.show();
}
