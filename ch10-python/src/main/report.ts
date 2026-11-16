import {
  app,
  dialog,
  shell,
  type BrowserWindow,
  type WebContents,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  IPC,
  type InputFolder,
  type PythonStatus,
  type ReportResult,
} from '../shared/ipc';
import { PythonError, PythonWorker, type PythonCommand } from './python';

// 개발 중: python 폴더의 가상 환경(uv sync로 만든 .venv)의 python으로 worker.py를 실행한다
export function pythonCommand(): PythonCommand {
  const dir = path.join(app.getAppPath(), 'python');
  const venvPython =
    process.platform === 'win32'
      ? path.join(dir, '.venv', 'Scripts', 'python.exe')
      : path.join(dir, '.venv', 'bin', 'python');
  // 이미 쓰던 Python(pandas·openpyxl 설치됨)을 쓰려면 SALES_PYTHON에 경로를 넣는다
  const python = process.env.SALES_PYTHON || venvPython;
  return { command: python, args: [path.join(dir, 'worker.py')], cwd: dir };
}

const worker = new PythonWorker(pythonCommand());
const running = new Map<string, number>(); // Renderer의 requestId → 작업자 요청 id

// 경로는 Main에만 둔다. Renderer에는 이름만 보낸다
let inputDir: string | null = null;
let lastOutput: string | null = null;

const errorMessage = (err: unknown) =>
  err instanceof PythonError
    ? { code: err.code, message: err.message }
    : { code: 'unknown', message: String(err) };

export async function pythonStatus(): Promise<PythonStatus> {
  try {
    const r = (await worker.request('hello').result) as {
      python: string;
      pandas: string;
      startupMs: number;
    };
    return { ok: true, mode: 'child_process', ...r };
  } catch (err) {
    const { code, message } = errorMessage(err);
    const hint =
      code === 'not-found' && !app.isPackaged
        ? ' python 폴더에서 uv sync를 실행했는지 확인하세요.'
        : '';
    return { ok: false, message: message + hint };
  }
}

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

export async function runReport(
  win: BrowserWindow,
  sender: WebContents,
  requestId: string,
): Promise<ReportResult> {
  if (!inputDir)
    return { ok: false, code: 'no-input', message: '먼저 폴더를 선택하세요.' };
  if (running.has(requestId))
    return { ok: false, code: 'busy', message: '이미 실행 중입니다.' };

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

  const started = Date.now();
  const { id, result } = worker.request(
    'report',
    { inputDir, output: save.filePath },
    (done, total, file) => {
      if (!sender.isDestroyed()) {
        sender.send(IPC.reportProgress, { requestId, done, total, file });
      }
    },
  );
  running.set(requestId, id);
  try {
    const r = (await result) as Record<string, unknown>;
    lastOutput = String(r.output);
    return {
      ok: true,
      summary: {
        outputName: path.basename(lastOutput),
        files: Number(r.files),
        rows: Number(r.rows),
        total: Number(r.total),
        branches: r.branches as string[],
        byMonth: r.byMonth as (string | number)[][],
        errors: r.errors as { file: string; message: string }[],
        elapsedMs: Date.now() - started,
      },
    };
  } catch (err) {
    return { ok: false, ...errorMessage(err) };
  } finally {
    running.delete(requestId);
  }
}

export function cancelReport(requestId: unknown) {
  if (typeof requestId !== 'string') return;
  const id = running.get(requestId);
  if (id !== undefined) worker.cancel(id);
}

export function openReport() {
  if (lastOutput) void shell.openPath(lastOutput);
}

export function stopPython() {
  worker.stop();
}
