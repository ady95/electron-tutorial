// 패키지된 앱 스모크 테스트 (12-3): 실행되어 창이 뜨는지만 확인한다
//   node tests/smoke-packaged.mjs "<패키지 실행 파일 경로>"
// 배포용 패키지는 Fuse(EnableNodeCliInspectArguments 끔) 때문에 Playwright가 붙지 못한다.
// 그래서 1단계의 성능 기록(CHAT_PERF=1)이 출력하는 "[perf] startup" 줄을 "창이 떴다"는 신호로 쓴다
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Forge(@electron/packager)는 앱 이름을 파일 이름으로 바꿀 때 유니코드 NFD로 정규화한다.
// Windows에서는 "AI 채팅"이라고 입력한 경로(NFC)와 실제 폴더 이름(NFD)이 달라 찾지 못하므로 둘 다 시도한다
const arg = process.argv[2] ?? '';
const exe = [arg, arg.normalize('NFD'), arg.normalize('NFC')].find(
  (p) => p && fs.existsSync(p),
);
if (!exe) {
  console.error(
    '패키지 실행 파일 경로를 주세요. 예: out/AI 채팅-win32-x64/AI 채팅.exe',
  );
  process.exit(2);
}
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ch12-smoke-'));
const env = { ...process.env, CHAT_PERF: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const args = [`--user-data-dir=${userData}`];
if (process.platform === 'darwin') args.push('--use-mock-keychain');

const child = spawn(exe, args, { env });
let out = '';
let result = null; // { message, code }
const timer = setTimeout(
  () => finish('시간 초과: 30초 안에 창이 뜨지 않았습니다', 1),
  30_000,
);

// 결과를 정하고 앱을 끝낸다. 정리와 출력은 앱이 실제로 끝난 뒤(exit)에 한다
function finish(message, code) {
  if (result) return;
  result = { message, code };
  clearTimeout(timer);
  child.kill();
}

child.stdout.on('data', (d) => {
  out += d;
  const line = out.split(/\r?\n/).find((l) => l.startsWith('[perf] startup '));
  if (!line) return;
  const { marks, metrics } = JSON.parse(line.slice('[perf] startup '.length));
  const shown = marks.find((m) => m.name === 'ready-to-show');
  if (!shown) return finish('창 표시 기록이 없습니다', 1);
  finish(`통과: ${shown.ms}ms에 창 표시, 프로세스 ${metrics.length}개`, 0);
});

child.on('exit', (code) => {
  clearTimeout(timer);
  result ??= { message: `앱이 먼저 종료되었습니다 (code ${code})`, code: 1 };
  // 앱이 끝난 뒤에도 하위 프로세스가 잠시 파일을 쥐고 있을 수 있어 몇 번 다시 시도한다
  fs.rmSync(userData, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
  console.log(result.message);
  process.exitCode = result.code;
});
