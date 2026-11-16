// Python 관리자(UtilityProcess)가 주고받는 메시지
import type { PythonStatus, ReportProgress, ReportResult } from './ipc';

// Python 작업자를 실행할 명령. 개발 중에는 python + worker.py, 배포본에서는 PyInstaller로 만든 exe
export interface PythonCommand {
  command: string;
  args: string[];
  cwd: string;
  notFoundHint?: string; // 실행 파일을 찾지 못했을 때 덧붙일 안내
}

// Python과 통신하는 방식. stdio: 표준 입출력(JSON Lines), http: 로컬 FastAPI 서버 (10-3 비교용)
export type Transport = 'stdio' | 'http';

// Main → 관리자 (process.parentPort)
export type HostCommand =
  | { type: 'init'; python: PythonCommand; transport: Transport }
  | { type: 'connect' } // ports[0]: 화면과 직접 연결할 MessagePort
  | { type: 'run'; jobId: string; inputDir: string; output: string }
  | { type: 'stop' };

// 관리자 → Main
export type HostEvent = { type: 'finished'; jobId: string; output: string };

// 화면 → 관리자 (MessagePort)
export type PortRequest =
  | { type: 'status' }
  | { type: 'cancel'; jobId: string };

// 관리자 → 화면 (MessagePort)
export type PortEvent =
  | { type: 'status'; status: PythonStatus }
  | { type: 'progress'; progress: ReportProgress }
  | { type: 'result'; jobId: string; result: ReportResult };
