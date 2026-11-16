import {
  app,
  ipcMain,
  session,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type WebContents,
  type WebFrameMain,
} from 'electron';
import { pathToFileURL } from 'node:url';
import { log } from './log';

// 앱 화면의 주소. 개발 중에는 Vite 개발 서버, 배포 후에는 패키지 안의 index.html
let appUrl: URL | null = null;

export function setAppUrl(url: string) {
  appUrl = new URL(url);
}

// 앱 화면의 출처. Local AI Handler가 받는 securityOrigin과 같은 형식으로 돌려준다 (11-4)
// file:// 페이지는 URL 객체의 origin이 'null'이지만 핸들러에는 'file://'로 온다
export function appOrigin() {
  if (!appUrl) return '';
  return appUrl.protocol === 'file:' ? 'file://' : appUrl.origin;
}

export function rendererFileUrl(indexHtml: string) {
  return pathToFileURL(indexHtml).href;
}

// 이 주소가 우리 앱 화면인가
export function isAppUrl(raw: string) {
  if (!appUrl) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (appUrl.protocol === 'file:') {
    // file://은 출처(origin)가 모두 같아 보이므로, 앱 폴더 안의 파일인지 경로로 비교한다
    const appDir = appUrl.pathname.slice(
      0,
      appUrl.pathname.lastIndexOf('/') + 1,
    );
    return url.protocol === 'file:' && url.pathname.startsWith(appDir);
  }
  return url.origin === appUrl.origin;
}

// IPC를 보낸 프레임이 우리 앱의 최상위 프레임인가
function isTrustedFrame(frame: WebFrameMain | null) {
  if (!frame) return false; // 이미 다른 페이지로 이동했거나 닫힌 프레임
  if (frame.parent !== null) return false; // 앱 화면 안의 iframe은 믿지 않는다
  if (!appUrl) return false;
  // http(s) 앱은 URL이 아니라 출처(origin)로 비교한다. about:blank 같은 문서는 URL만 보면 속을 수 있다
  // file:// 앱은 출처가 모두 "file://"로 같으므로 경로까지 비교한다
  if (appUrl.protocol === 'file:') return isAppUrl(frame.url);
  return frame.origin === appUrl.origin;
}

const describe = (frame: WebFrameMain | null) =>
  frame ? frame.origin : '(프레임 없음)';

// ipcMain.handle 대신 쓴다. 송신자 검증을 빠뜨릴 수 없게 한 곳에 모은다
export function handle(
  channel: string,
  listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedFrame(event.senderFrame)) {
      log.warn(
        `[보안] 신뢰할 수 없는 송신자 차단: ${channel} from ${describe(event.senderFrame)}`,
      );
      throw new Error('허용되지 않은 요청입니다.');
    }
    return listener(event, ...args);
  });
}

export function on(
  channel: string,
  listener: (event: IpcMainEvent, ...args: unknown[]) => void,
) {
  ipcMain.on(channel, (event, ...args) => {
    if (!isTrustedFrame(event.senderFrame)) {
      log.warn(
        `[보안] 신뢰할 수 없는 송신자 차단: ${channel} from ${describe(event.senderFrame)}`,
      );
      return;
    }
    listener(event, ...args);
  });
}

// 모든 webContents(창, 뷰)에 내비게이션·새 창 제한을 건다
function hardenContents(contents: WebContents) {
  contents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
      log.warn(`[보안] 앱 밖으로 이동 차단: ${url}`);
    }
  });
  contents.setWindowOpenHandler(({ url }) => {
    // 새 Electron 창은 열지 않는다. https 링크만 OS 기본 브라우저로 연다
    if (url.startsWith('https://')) {
      void shell.openExternal(url);
    } else {
      log.warn(`[보안] 새 창 열기 차단: ${url}`);
    }
    return { action: 'deny' };
  });
  contents.on('will-attach-webview', (event) => {
    event.preventDefault(); // <webview> 태그는 쓰지 않는다
  });
}

export function applySecurity() {
  // 모든 Renderer를 sandbox로 실행한다 (app ready 전에 호출해야 한다)
  app.enableSandbox();
  app.on('web-contents-created', (_event, contents) =>
    hardenContents(contents),
  );
  app.whenReady().then(() => {
    // 카메라·위치·알림 등은 모두 거부하고, 꼭 필요한 권한만 앱 화면에 허용한다.
    // 이 앱은 웹 권한을 쓰지 않는다. 필요해지면 ALLOWED_PERMISSIONS에 하나씩 추가한다 (9장 참고)
    const allowed = (permission: string, url: string) =>
      ALLOWED_PERMISSIONS.has(permission) && isAppUrl(url);
    session.defaultSession.setPermissionRequestHandler(
      (wc, permission, callback, details) => {
        const ok = allowed(permission, details.requestingUrl ?? wc.getURL());
        if (!ok) log.warn(`[보안] 권한 요청 거부: ${permission}`);
        callback(ok);
      },
    );
    // file:// 앱은 출처(origin)만으로 구분할 수 없으므로 가능하면 전체 URL로 확인한다
    session.defaultSession.setPermissionCheckHandler(
      (_wc, permission, requestingOrigin, details) =>
        allowed(permission, details.requestingUrl ?? requestingOrigin),
    );
  });
}

const ALLOWED_PERMISSIONS = new Set<string>();
