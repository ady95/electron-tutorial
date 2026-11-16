// 단위 테스트를 "앱과 같은 런타임"에서 실행한다.
// 시스템 Node.js가 아니라 Electron에 들어 있는 Node.js로 node --test를 돌린다.
// (예: CP949 확장 글자는 Node.js 26과 Electron 45의 TextDecoder 결과가 다르다)
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const electron = require('electron'); // Node에서 불러오면 실행 파일 경로를 돌려준다

const dir = 'src/shared';
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.test.ts'))
  .map((f) => path.join(dir, f));

const { status } = spawnSync(electron, ['--test', ...files], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
});
process.exit(status ?? 1);
