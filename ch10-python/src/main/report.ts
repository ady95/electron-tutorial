import {
  app,
  dialog,
  MessageChannelMain,
  shell,
  utilityProcess,
  type BrowserWindow,
  type MessagePortMain,
  type UtilityProcess,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type {
  HostCommand,
  HostEvent,
  PythonCommand,
  Transport,
} from '../shared/host';
import { IPC, type InputFolder, type StartResult } from '../shared/ipc';

// 환경 변수로 바꾸는 설정(SALES_BACKEND, SALES_PYTHON)은 개발 중에만 따른다
const transport = (): Transport =>
  !app.isPackaged && process.env.SALES_BACKEND === 'http' ? 'http' : 'stdio';

export function pythonCommand(): PythonCommand {
  if (app.isPackaged) {
    // 배포본: PyInstaller로 만든 작업자. extraResource로 resources 폴더에 들어 있다
    const dir = path.join(process.resourcesPath, 'sales-worker');
    const exe =
      process.platform === 'win32' ? 'sales-worker.exe' : 'sales-worker';
    return {
      command: path.join(dir, exe),
      args: [],
      cwd: dir,
      notFoundHint: '앱을 다시 설치하세요.',
    };
  }
  // 개발 중: python 폴더의 가상 환경(uv sync로 만든 .venv)의 python으로 worker.py를 실행한다
  const dir = path.join(app.getAppPath(), 'python');
  const venvPython =
    process.platform === 'win32'
      ? path.join(dir, '.venv', 'Scripts', 'python.exe')
      : path.join(dir, '.venv', 'bin', 'python');
  // 이미 쓰던 Python(pandas·openpyxl 설치됨)을 쓰려면 SALES_PYTHON에 경로를 넣는다
  const python = process.env.SALES_PYTHON || venvPython;
  // 10-3 비교용: SALES_BACKEND=http이면 FastAPI 서버(server.py)로 실행한다
  const script = transport() === 'http' ? 'server.py' : 'worker.py';
  return {
    command: python,
    args: [path.join(dir, script)],
    cwd: dir,
    notFoundHint: 'python 폴더에서 uv sync를 실행했는지 확인하세요.',
  };
}

// --- Python 관리자 (UtilityProcess) ---
let host: UtilityProcess | null = null;
let quitting = false;
const windows = new Set<BrowserWindow>();

const send = (m: HostCommand, ports?: MessagePortMain[]) =>
  host?.postMessage(m, ports);

function startHost() {
  const child = utilityProcess.fork(
    path.join(__dirname, 'python-host.cjs'),
    [],
    {
      serviceName: 'Python 작업 관리자', // 작업 관리자에 표시되는 이름
    },
  );
  host = child;
  send({ type: 'init', python: pythonCommand(), transport: transport() });
  child.on('message', (m: HostEvent) => {
    if (m.type === 'finished') lastOutput = m.output;
  });
  child.on('exit', (code) => {
    if (host !== child) return;
    host = null;
    if (quitting) return;
    // 관리자가 비정상 종료되면 다시 띄우고, 열려 있는 창마다 새 통로를 연결한다
    console.warn(`[python-host] 종료됨 (code ${code}). 다시 시작합니다.`);
    startHost();
    for (const win of windows) connectWindow(win);
  });
}

// 창과 관리자 사이에 MessagePort 통로를 만든다. 한쪽은 화면(Preload)에, 다른 쪽은 관리자에
export function connectWindow(win: BrowserWindow) {
  if (!host) startHost();
  windows.add(win);
  win.once('closed', () => windows.delete(win));
  const { port1, port2 } = new MessageChannelMain();
  send({ type: 'connect' }, [port2]);
  win.webContents.postMessage(IPC.pythonPort, null, [port1]);
}

export function stopHost() {
  quitting = true;
  send({ type: 'stop' }); // Python 작업자의 표준 입력을 닫아 스스로 끝나게 한다
}

// --- 대화상자와 경로 (Main에만 둔다. 화면에는 이름만 보낸다) ---
let inputDir: string | null = null;
let lastOutput: string | null = null;

const isDataFile = (name: string) =>
  /\.(xlsx|csv)$/i.test(name) && !name.startsWith('~$');

export async function selectInput(
  win: BrowserWindow,
): Promise<InputFolder | null> {
  const r = await dialog.showOpenDialog(win, {
    title: '매출 파일이 있는 폴더 선택',
    properties: ['openDirectory'],
  });
  if (r.canceled || r.filePaths.length === 0) return null;
  inputDir = r.filePaths[0];
  const files = fs.readdirSync(inputDir).filter(isDataFile).length;
  return { name: path.basename(inputDir), files };
}

// 파일 이름에 넣을 날짜는 로컬 시간으로 만든다 (toISOString은 UTC라 오전 9시 전에는 전날이 된다)
function today() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

// 저장 위치를 받은 뒤 관리자에게 작업을 넘긴다. 결과는 관리자가 화면에 직접 보낸다
export async function startReport(
  win: BrowserWindow,
  jobId: string,
): Promise<StartResult> {
  if (!inputDir) {
    return { ok: false, code: 'no-input', message: '먼저 폴더를 선택하세요.' };
  }
  const save = await dialog.showSaveDialog(win, {
    title: '보고서 저장',
    defaultPath: path.join(
      app.getPath('documents'),
      `매출보고서-${today()}.xlsx`,
    ),
    filters: [{ name: '엑셀 통합 문서', extensions: ['xlsx'] }],
  });
  if (save.canceled || !save.filePath) {
    return {
      ok: false,
      code: 'cancelled',
      message: '저장 위치를 선택하지 않았습니다.',
    };
  }
  if (!host) {
    return {
      ok: false,
      code: 'no-host',
      message: 'Python 관리자가 실행 중이 아닙니다.',
    };
  }
  send({ type: 'run', jobId, inputDir, output: save.filePath });
  return { ok: true };
}

export function openReport() {
  if (lastOutput) void shell.openPath(lastOutput);
}
