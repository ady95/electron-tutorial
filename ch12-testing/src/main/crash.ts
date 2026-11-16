// 크래시와 예상하지 못한 오류 처리 (12-4)
import { app, BrowserWindow, crashReporter, dialog } from 'electron';
import { log } from './log';

// 화면이 연달아 죽을 때 무한히 다시 불러오지 않도록 창마다 최근 재시작 시각을 기억한다
const reloads = new Map<number, number[]>();

export function setupCrashHandling() {
  // 크래시가 나면 미니덤프(.dmp)를 app.getPath('crashDumps')에 남긴다.
  // 서버로는 보내지 않는다 (보내려면 submitURL과 개인정보 안내가 필요하다)
  crashReporter.start({ uploadToServer: false });

  // Main 프로세스의 처리되지 않은 오류. 기록하고 사용자에게 알린다
  process.on('uncaughtException', (err) => {
    log.error('[Main] 처리되지 않은 예외', err);
    if (app.isReady()) {
      dialog.showErrorBox(
        '예상하지 못한 오류',
        '앱에 문제가 생겼습니다. 계속 문제가 생기면 설정의 [로그 폴더 열기]로 로그를 보내 주세요.',
      );
    }
  });
  process.on('unhandledRejection', (reason) => {
    log.error('[Main] 처리되지 않은 Promise 거부', reason);
  });

  // 화면(Renderer) 프로세스가 죽었다. 창은 남아 있지만 빈 화면이 된다
  app.on('render-process-gone', (_event, contents, details) => {
    log.error(
      `[Renderer] 종료됨: reason=${details.reason} exitCode=${details.exitCode}`,
    );
    if (details.reason === 'clean-exit') return;
    const win = BrowserWindow.fromWebContents(contents);
    if (!win || win.isDestroyed()) return;
    const now = Date.now();
    const recent = (reloads.get(contents.id) ?? []).filter(
      (t) => now - t < 60_000,
    );
    if (recent.length >= 3) {
      log.error('[Renderer] 1분 안에 3번 종료되어 다시 불러오지 않습니다');
      dialog.showErrorBox(
        '화면 오류',
        '화면이 계속 종료됩니다. 앱을 다시 시작해 주세요.',
      );
      return;
    }
    reloads.set(contents.id, [...recent, now]);
    contents.reload();
  });

  // Utility·GPU 등 다른 자식 프로세스가 죽었다 (Local AI Handler는 local-ai.ts가 다시 시작한다)
  app.on('child-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return;
    log.warn(
      `[자식 프로세스] ${details.type}${details.name ? `(${details.name})` : ''} 종료: reason=${details.reason} exitCode=${details.exitCode}`,
    );
  });
}
