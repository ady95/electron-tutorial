// CSV 변환 순수 함수. Electron이나 Node API를 쓰지 않는다 (Main, Renderer, 테스트 어디서나 쓸 수 있다)
import type { JobSummary } from './ipc';
import { STATUS_LABEL } from './status.ts';

// Excel(Windows)이 UTF-8로 인식하도록 파일 맨 앞에 붙이는 BOM
export const BOM = '\uFEFF';

export const HISTORY_HEADER = ['시각', '폴더', '파일 수', '결과', '메시지'];

// = + - @ 로 시작하면 Excel이 수식으로 해석한다. 탭·CR도 수식 시작으로 쓰일 수 있어 함께 막는다
const FORMULA_START = /^[=+\-@\t\r]/;

// 셀 하나를 CSV 필드로 바꾼다
// - 문자열이 수식처럼 시작하면 앞에 ' 를 붙여 글자로 보이게 한다
// - 쉼표·큰따옴표·줄바꿈이 있으면 큰따옴표로 감싸고, 안의 큰따옴표는 두 번 쓴다
export function escapeCell(value: string | number): string {
  let s = String(value);
  if (typeof value === 'string' && FORMULA_START.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replaceAll('"', '""')}"`;
  return s;
}

// 표를 CSV 문자열로 바꾼다. 줄 끝은 CRLF(RFC 4180)
export function toCsv(header: string[], rows: (string | number)[][]): string {
  return [header, ...rows]
    .map((row) => row.map(escapeCell).join(','))
    .join('\r\n')
    .concat('\r\n');
}

const pad = (n: number) => String(n).padStart(2, '0');

// ISO 시각을 사람이 읽는 지역 시각(YYYY-MM-DD HH:mm:ss)으로 바꾼다
export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

// 이력 목록을 파일에 그대로 쓸 CSV 내용(BOM 포함)으로 바꾼다
export function historyToCsv(jobs: Omit<JobSummary, 'sample'>[]): string {
  const rows = jobs.map((job) => [
    formatTime(job.startedAt),
    job.folderName,
    job.total,
    STATUS_LABEL[job.status] ?? job.status,
    job.message,
  ]);
  return BOM + toCsv(HISTORY_HEADER, rows);
}

// 기본 파일 이름: history-YYYYMMDD.csv (지역 날짜 기준)
export function historyFileName(date: Date): string {
  return `history-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}.csv`;
}
