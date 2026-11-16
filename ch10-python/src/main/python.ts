import { spawn, type ChildProcess } from 'node:child_process';
import readline from 'node:readline';
import { encodeRequest, parseWorkerLine } from '../shared/protocol';

// Python 작업자를 실행할 명령. 개발 중에는 python + worker.py, 배포본에서는 PyInstaller로 만든 exe
export interface PythonCommand {
  command: string;
  args: string[];
  cwd: string;
}

export class PythonError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface Pending {
  resolve: (result: unknown) => void;
  reject: (err: PythonError) => void;
  onProgress?: (done: number, total: number, file: string) => void;
}

// 오래 살아 있는 Python 프로세스 하나와 JSON Lines로 대화한다.
// pandas를 불러오는 데만 0.5초 이상 걸리므로, 요청마다 새로 실행하지 않고 재사용한다
export class PythonWorker {
  private child: ChildProcess | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private stderrTail: string[] = [];

  constructor(private readonly cmd: PythonCommand) {}

  private ensureStarted(): ChildProcess {
    if (this.child) return this.child;
    const child = spawn(this.cmd.command, this.cmd.args, {
      cwd: this.cmd.cwd,
      windowsHide: true, // Windows에서 검은 콘솔 창을 띄우지 않는다
      env: {
        ...process.env,
        PYTHONUTF8: '1', // 오류 메시지(stderr)의 한글이 CP949로 나오지 않게
        PYTHONUNBUFFERED: '1', // stderr 로그가 늦게 오지 않게
      },
    });
    this.child = child;
    this.stderrTail = [];
    // 작업자가 이미 죽은 뒤에 쓰면 EPIPE가 난다. 처리하지 않으면 Main 전체가 죽는다
    child.stdin!.on('error', (err) =>
      console.warn(`[python stdin] ${err.message}`),
    );

    // 조각(chunk)은 줄 중간에서 끊겨 올 수 있다. readline이 줄 단위로 다시 모아 준다
    readline
      .createInterface({ input: child.stdout! })
      .on('line', (line) => this.onLine(line));
    readline.createInterface({ input: child.stderr! }).on('line', (line) => {
      console.log(`[python] ${line}`);
      this.stderrTail = [...this.stderrTail.slice(-19), line];
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      // 실행 파일을 찾지 못하면(ENOENT) exit 없이 error만 온다
      this.onExit(
        child,
        new PythonError(
          err.code === 'ENOENT' ? 'not-found' : 'spawn-failed',
          err.code === 'ENOENT'
            ? 'Python 실행 환경을 찾지 못했습니다.'
            : `Python을 실행하지 못했습니다: ${err.message}`,
        ),
      );
    });
    child.on('exit', (code, signal) => {
      const last = this.stderrTail.at(-1) ?? '';
      this.onExit(
        child,
        new PythonError(
          'exited',
          `Python 작업자가 종료되었습니다 (code ${code ?? signal}). ${last}`.trim(),
        ),
      );
    });
    return child;
  }

  private onLine(line: string) {
    const msg = parseWorkerLine(line);
    if (!msg) {
      // 프로토콜이 아닌 줄(라이브러리의 print 등)은 버리지 않고 로그로 남긴다
      console.warn(`[python stdout] 프로토콜이 아닌 줄: ${line}`);
      return;
    }
    const p = this.pending.get(msg.id);
    if (!p) return;
    if (msg.type === 'progress') {
      p.onProgress?.(msg.done, msg.total, msg.file);
      return;
    }
    this.pending.delete(msg.id);
    if (msg.type === 'result') p.resolve(msg.result);
    else p.reject(new PythonError(msg.code, msg.message));
  }

  private onExit(child: ChildProcess, err: PythonError) {
    if (this.child !== child) return; // error와 exit가 둘 다 와도 한 번만 처리한다
    this.child = null;
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  // 요청을 보내고, 작업자가 응답할 때까지 기다린다. 작업자가 죽어 있으면 다시 실행한다
  request(
    method: string,
    params?: unknown,
    onProgress?: Pending['onProgress'],
  ): { id: number; result: Promise<unknown> } {
    const child = this.ensureStarted();
    const id = this.nextId++;
    const result = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress });
    });
    child.stdin!.write(encodeRequest(id, method, params));
    return { id, result };
  }

  cancel(id: number) {
    if (this.pending.has(id))
      this.child?.stdin!.write(encodeRequest(id, 'cancel'));
  }

  // 표준 입력을 닫으면 작업자가 스스로 끝난다. 3초 안에 안 끝나면 강제로 종료한다
  stop() {
    const child = this.child;
    if (!child) return;
    child.stdin!.end();
    const timer = setTimeout(() => child.kill(), 3000);
    child.once('exit', () => clearTimeout(timer));
  }
}
