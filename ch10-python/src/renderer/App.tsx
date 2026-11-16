import { useEffect, useRef, useState } from 'react';
import type {
  InputFolder,
  PythonStatus,
  ReportProgress,
  ReportResult,
} from '../shared/ipc';

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

export default function App() {
  const [status, setStatus] = useState<PythonStatus | null>(null);
  const [input, setInput] = useState<InputFolder | null>(null);
  const [progress, setProgress] = useState<ReportProgress | null>(null);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const currentId = useRef<string | null>(null);

  useEffect(() => {
    void window.api.pythonStatus().then(setStatus);
    return window.api.onReportProgress((p) => {
      if (p.requestId === currentId.current) setProgress(p);
    });
  }, []);

  const choose = async () => {
    const folder = await window.api.selectInput();
    if (folder) {
      setInput(folder);
      setResult(null);
    }
  };

  const run = async () => {
    const id = crypto.randomUUID();
    currentId.current = id;
    setBusy(true);
    setProgress(null);
    setResult(null);
    try {
      setResult(await window.api.runReport(id));
    } finally {
      currentId.current = null;
      setBusy(false);
    }
  };

  const cancel = () => {
    if (currentId.current) window.api.cancelReport(currentId.current);
  };

  const summary = result?.ok ? result.summary : null;

  return (
    <main>
      <header>
        <h1>매출 보고서 도우미</h1>
        <p className="status" data-testid="python-status">
          {status === null
            ? 'Python 준비 중…'
            : status.ok
              ? `Python ${status.python} · pandas ${status.pandas} · 준비 ${status.startupMs}ms (${status.mode})`
              : `Python 사용 불가: ${status.message}`}
        </p>
      </header>

      <section className="toolbar">
        <button onClick={choose} disabled={busy}>
          폴더 선택
        </button>
        <span data-testid="input">
          {input
            ? `${input.name} — 엑셀·CSV ${input.files}개`
            : '매출 파일이 있는 폴더를 선택하세요.'}
        </span>
        <button onClick={run} disabled={!input || busy || !status?.ok}>
          보고서 만들기
        </button>
        {busy && <button onClick={cancel}>취소</button>}
      </section>

      {busy && (
        <section className="progress" data-testid="progress">
          <progress value={progress?.done ?? 0} max={progress?.total ?? 1} />
          <span>
            {progress
              ? `${progress.done}/${progress.total} ${progress.file}`
              : '시작하는 중…'}
          </span>
        </section>
      )}

      {result && !result.ok && (
        <p className="error" data-testid="error">
          {result.message}
        </p>
      )}

      {summary && (
        <section data-testid="summary">
          <p>
            <strong>{summary.outputName}</strong> 저장 완료 — 파일{' '}
            {summary.files}개, {summary.rows.toLocaleString()}행, 합계{' '}
            {won(summary.total)} ({(summary.elapsedMs / 1000).toFixed(1)}초){' '}
            <button onClick={() => window.api.openReport()}>보고서 열기</button>
          </p>
          <table>
            <thead>
              <tr>
                <th>월</th>
                {summary.branches.map((b) => (
                  <th key={b}>{b}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.byMonth.map(([month, ...values]) => (
                <tr key={String(month)}>
                  <td>{month}</td>
                  {values.map((v, i) => (
                    <td key={i} className="num">
                      {Number(v).toLocaleString('ko-KR')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {summary.errors.length > 0 && (
            <div className="warn" data-testid="skipped">
              <strong>제외한 파일 {summary.errors.length}개</strong>
              <ul>
                {summary.errors.map((e) => (
                  <li key={e.file}>
                    {e.file}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
