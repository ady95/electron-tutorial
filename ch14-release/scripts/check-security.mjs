// 소스 코드에서 위험한 Electron 설정과 보안 규칙 위반을 찾는다.
// 사용: npm run check:security   (위반이 있으면 종료 코드 1)
// 문자열 검사이므로 모든 문제를 찾지는 못한다. 사람의 검토와 실행 테스트를 대신하지 않는다.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src');

const RULES = [
  {
    id: 'node-integration',
    re: /nodeIntegration(InWorker|InSubFrames)?\s*:\s*true/,
    msg: 'Renderer에서 Node.js를 켜면 안 됩니다',
  },
  {
    id: 'context-isolation',
    re: /contextIsolation\s*:\s*false/,
    msg: 'contextIsolation을 끄면 안 됩니다',
  },
  { id: 'sandbox', re: /sandbox\s*:\s*false/, msg: 'sandbox를 끄면 안 됩니다' },
  {
    id: 'web-security',
    re: /webSecurity\s*:\s*false/,
    msg: 'webSecurity를 끄면 안 됩니다',
  },
  {
    id: 'insecure-content',
    re: /allowRunningInsecureContent\s*:\s*true/,
    msg: '혼합 콘텐츠를 허용하면 안 됩니다',
  },
  {
    id: 'experimental',
    re: /experimentalFeatures\s*:\s*true|enableBlinkFeatures/,
    msg: '실험 기능·Blink 기능을 켜지 않습니다',
  },
  {
    id: 'webview',
    re: /webviewTag\s*:\s*true|<webview/,
    msg: 'webview를 쓰지 않습니다',
  },
  {
    id: 'raw-ipc',
    re: /ipcMain\.(handle|on|once)\(/,
    msg: 'IPC는 security.ts의 handle()/on()으로 등록합니다 (송신자 검증)',
    allow: ['main/security.ts'],
  },
  {
    id: 'expose-ipc',
    re: /exposeInMainWorld\([^)]*ipcRenderer/,
    msg: 'ipcRenderer를 웹 페이지에 그대로 노출하지 않습니다',
  },
  {
    id: 'open-external',
    re: /shell\.openExternal\(/,
    msg: 'openExternal은 security.ts에서만 (https 검사 후) 호출합니다',
    allow: ['main/security.ts'],
  },
  {
    id: 'eval',
    re: /\beval\(|new Function\(/,
    msg: '문자열을 코드로 실행하지 않습니다',
  },
];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(ts|tsx|mts|html)$/.test(e.name) ? [p] : [];
  });
}

const files = [...walk(SRC), path.join(ROOT, 'index.html')];
const problems = [];
for (const file of files) {
  const rel = path.relative(SRC, file).replaceAll('\\', '/');
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((raw, i) => {
    if (raw.trim().startsWith('//')) return; // 주석 줄은 건너뛴다
    const line = raw.replace(/\s\/\/\s.*$/, ''); // 줄 끝 주석도 뗀다 (https:// 같은 문자열은 남긴다)
    for (const rule of RULES) {
      if (rule.allow?.includes(rel)) continue;
      if (rule.re.test(line))
        problems.push(`${rel}:${i + 1} [${rule.id}] ${rule.msg}`);
    }
  });
}

// CSP가 index.html에 있는지
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
if (!/Content-Security-Policy/.test(html))
  problems.push(
    'index.html [csp] Content-Security-Policy meta 태그가 없습니다',
  );
if (/script-src[^;"]*'unsafe-(inline|eval)'/.test(html))
  problems.push(
    "index.html [csp] script-src에 'unsafe-inline'이나 'unsafe-eval'을 쓰지 않습니다",
  );

console.log(`검사한 파일 ${files.length}개, 위반 ${problems.length}건`);
for (const p of problems) console.log(`  ${p}`);
process.exit(problems.length > 0 ? 1 : 0);
