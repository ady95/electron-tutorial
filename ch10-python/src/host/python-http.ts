import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import readline from 'node:readline';
import type { PythonCommand } from '../shared/host';
import { PythonError } from './python';

type OnProgress = (done: number, total: number, file: string) => void;

// 10-3 비교용: 같은 작업을 로컬 FastAPI 서버로 요청한다. PythonWorker와 같은 모양으로 쓴다
export class PythonHttpWorker {
  private child: ChildProcess | null = null;
  private base: Promise<string> | null = null; // http://127.0.0.1:포트
  private readonly token = randomBytes(32).toString('hex'); // 실행할 때마다 새로 만든다
  private nextId = 1;
  private readonly aborts = new Map<number, AbortController>();

  constructor(private readonly cmd: PythonCommand) {}

  private ensureStarted(): Promise<string> {
    if (this.base) return this.base;
    const child = spawn(this.cmd.command, this.cmd.args, {
      cwd: this.cmd.cwd,
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONUTF8: '1',
        PYTHONUNBUFFERED: '1',
        SALES_TOKEN: this.token, // 명령줄 인자는 다른 프로세스가 볼 수 있으므로 환경 변수로 넘긴다
      },
    });
    this.child = child;
    child.stdin!.on('error', () => {});
    readline
      .createInterface({ input: child.stderr! })
      .on('line', (l) => console.log(`[python-http] ${l}`));
    this.base = new Promise((resolve, reject) => {
      // 서버가 고른 포트를 표준 출력 첫 줄로 받는다
      readline
        .createInterface({ input: child.stdout! })
        .once('line', (line) => {
          const { port } = JSON.parse(line) as { port: number };
          resolve(`http://127.0.0.1:${port}`);
        });
      child.once('error', (err) =>
        reject(
          new PythonError(
            'not-found',
            `Python을 실행하지 못했습니다: ${err.message}`,
          ),
        ),
      );
      child.once('exit', (code) =>
        reject(
          new PythonError(
            'exited',
            `Python 서버가 종료되었습니다 (code ${code}).`,
          ),
        ),
      );
    });
    child.once('exit', () => {
      this.child = null;
      this.base = null;
    });
    return this.base;
  }

  private async fetchJson(path: string, init: RequestInit = {}) {
    const base = await this.ensureStarted();
    return fetch(base + path, {
      ...init,
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
      },
    });
  }

  request(
    method: string,
    params?: unknown,
    onProgress?: OnProgress,
  ): { id: number; result: Promise<unknown> } {
    const id = this.nextId++;
    const result =
      method === 'hello'
        ? this.fetchJson('/hello').then((r) => r.json())
        : this.report(id, params, onProgress);
    return { id, result };
  }

  private async report(id: number, params: unknown, onProgress?: OnProgress) {
    const abort = new AbortController();
    this.aborts.set(id, abort);
    try {
      const res = await this.fetchJson('/report', {
        method: 'POST',
        body: JSON.stringify(params),
        signal: abort.signal,
      });
      if (!res.ok || !res.body) {
        throw new PythonError('http', `HTTP ${res.status}`);
      }
      // 응답 본문은 한 줄에 JSON 하나(NDJSON). 조각을 줄 단위로 나눈다
      const decoder = new TextDecoder();
      let rest = '';
      for await (const chunk of res.body) {
        rest += decoder.decode(chunk, { stream: true });
        let i: number;
        while ((i = rest.indexOf('\n')) >= 0) {
          const m = JSON.parse(rest.slice(0, i));
          rest = rest.slice(i + 1);
          if (m.type === 'progress') onProgress?.(m.done, m.total, m.file);
          else if (m.type === 'result') return m.result;
          else throw new PythonError(m.code, m.message);
        }
      }
      throw new PythonError('exited', '서버 응답이 중간에 끊겼습니다.');
    } catch (err) {
      if (abort.signal.aborted)
        throw new PythonError('cancelled', '취소했습니다.');
      if (err instanceof PythonError) throw err;
      throw new PythonError(
        'http',
        `서버에 요청하지 못했습니다: ${String(err)}`,
      );
    } finally {
      this.aborts.delete(id);
    }
  }

  // HTTP에는 "이 요청을 취소"라는 메시지가 없다. 연결을 끊으면 서버가 알아차리고 멈춘다
  cancel(id: number) {
    this.aborts.get(id)?.abort();
  }

  stop() {
    this.child?.stdin!.end();
  }
}
