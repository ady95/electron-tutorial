// Python 관리자: UtilityProcess에서 실행된다 (Main이 utilityProcess.fork로 띄운다).
// Python 작업자를 실행·관리하고, 진행률과 결과는 MessagePort로 화면에 직접 보낸다.
// Main은 대화상자와 경로 결정만 맡고, 작업 데이터는 Main을 거치지 않는다.
import type { MessagePortMain } from 'electron';
import type {
  HostCommand,
  HostEvent,
  PortEvent,
  PortRequest,
} from './shared/host';
import type { PythonStatus, ReportResult } from './shared/ipc';
import { PythonError, PythonWorker } from './host/python';

let worker: PythonWorker | null = null;
const ports = new Set<MessagePortMain>(); // 연결된 화면 (창마다 하나)
const running = new Map<string, number>(); // 화면의 jobId → 작업자 요청 id

const broadcast = (m: PortEvent) => {
  for (const p of ports) p.postMessage(m);
};
const toMain = (m: HostEvent) => process.parentPort.postMessage(m);

const errorOf = (err: unknown) =>
  err instanceof PythonError
    ? { code: err.code, message: err.message }
    : { code: 'unknown', message: String(err) };

async function status(): Promise<PythonStatus> {
  if (!worker) return { ok: false, message: '초기화되지 않았습니다.' };
  try {
    const r = (await worker.request('hello').result) as {
      python: string;
      pandas: string;
      startupMs: number;
    };
    return { ok: true, mode: 'utilityProcess', ...r };
  } catch (err) {
    return { ok: false, message: errorOf(err).message };
  }
}

async function run(jobId: string, inputDir: string, output: string) {
  if (!worker || running.has(jobId)) return;
  const started = Date.now();
  const { id, result } = worker.request(
    'report',
    { inputDir, output },
    (done, total, file) =>
      broadcast({
        type: 'progress',
        progress: { requestId: jobId, done, total, file },
      }),
  );
  running.set(jobId, id);
  let r: ReportResult;
  try {
    const v = (await result) as Record<string, unknown>;
    const out = String(v.output);
    toMain({ type: 'finished', jobId, output: out }); // 전체 경로는 Main에만 알린다
    r = {
      ok: true,
      summary: {
        outputName: out.split(/[\\/]/).pop() ?? '',
        files: Number(v.files),
        rows: Number(v.rows),
        total: Number(v.total),
        branches: v.branches as string[],
        byMonth: v.byMonth as (string | number)[][],
        errors: v.errors as { file: string; message: string }[],
        elapsedMs: Date.now() - started,
      },
    };
  } catch (err) {
    r = { ok: false, ...errorOf(err) };
  } finally {
    running.delete(jobId);
  }
  broadcast({ type: 'result', jobId, result: r });
}

// 화면에서 온 메시지. 화면도 믿지 않고 형식을 검사한다
async function onPortMessage(port: MessagePortMain, data: unknown) {
  const m = (data ?? {}) as Partial<PortRequest> & Record<string, unknown>;
  if (m.type === 'status') {
    port.postMessage({
      type: 'status',
      status: await status(),
    } satisfies PortEvent);
  } else if (m.type === 'cancel' && typeof m.jobId === 'string') {
    const id = running.get(m.jobId);
    if (id !== undefined) worker?.cancel(id);
  }
}

process.parentPort.on('message', (e) => {
  const msg = e.data as HostCommand;
  switch (msg.type) {
    case 'init':
      worker = new PythonWorker(msg.python);
      break;
    case 'connect': {
      const port = e.ports[0];
      ports.add(port);
      port.on('message', (pe) => void onPortMessage(port, pe.data));
      port.on('close', () => ports.delete(port)); // 창이 닫히거나 새로고침되면
      port.start();
      break;
    }
    case 'run':
      void run(msg.jobId, msg.inputDir, msg.output);
      break;
    case 'stop':
      worker?.stop();
      break;
  }
});
