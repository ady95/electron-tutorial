// Vitest를 "앱과 같은 런타임"(Electron에 들어 있는 Node.js)으로 실행한다 (12-2)
// 시스템 Node.js와 Electron의 Node.js는 버전이 다르다. 9장에서는 같은 TextDecoder의 결과가 달랐다
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const electron = require('electron'); // Node에서 불러오면 실행 파일 경로를 돌려준다
// vitest.mjs는 패키지 exports에 없어서 require.resolve로 찾을 수 없다. 경로를 직접 만든다
const vitest = path.join(
  import.meta.dirname,
  '..',
  'node_modules',
  'vitest',
  'vitest.mjs',
);

const { status } = spawnSync(
  electron,
  [vitest, 'run', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  },
);
process.exit(status ?? 1);
