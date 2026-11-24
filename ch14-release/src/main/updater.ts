// 14-3: 자동 업데이트. GitHub Releases에 새 버전이 올라오면 받아 두고, 다시 시작할 때 적용한다
// update.electronjs.org(Electron 팀의 무료 업데이트 서비스)가 공개 저장소의 릴리스를 읽어 알려 준다
import { app } from 'electron';
import {
  makeUserNotifier,
  updateElectronApp,
  UpdateSourceType,
} from 'update-electron-app';
import { log } from './log';

export function startAutoUpdate() {
  // 개발 중(npm start)과 GUI 테스트에서는 확인하지 않는다
  if (!app.isPackaged) return;
  // 설치 직후 첫 실행에는 Squirrel이 아직 작업 중이라 업데이트 확인이 실패할 수 있다
  if (process.argv.includes('--squirrel-firstrun')) {
    log.info('[update] 설치 직후 첫 실행이라 이번에는 확인하지 않습니다');
    return;
  }
  updateElectronApp({
    updateSource: {
      type: UpdateSourceType.ElectronPublicUpdateService,
      repo: 'ady95/electron-tutorial',
    },
    updateInterval: '1 hour', // 앱을 켤 때 한 번, 그 뒤 1시간마다
    logger: {
      log: (...a: unknown[]) => log.info('[update]', ...a),
      info: (...a: unknown[]) => log.info('[update]', ...a),
      warn: (...a: unknown[]) => log.warn('[update]', ...a),
      error: (...a: unknown[]) => log.error('[update]', ...a),
    },
    // 새 버전을 다 받은 뒤에만 묻는다. [나중에]를 누르면 다음에 앱을 끌 때 적용된다
    onNotifyUser: makeUserNotifier({
      title: 'AI 채팅 업데이트',
      detail: '새 버전을 받았습니다. 다시 시작하면 적용됩니다.',
      restartButtonText: '다시 시작',
      laterButtonText: '나중에',
    }),
  });
}
