import { useEffect, useMemo, useState } from 'react';
import type { BatchResult, FolderInfo, Progress } from '../shared/ipc';
import { makePlan, type RenameRule } from '../shared/rename';

export default function App() {
  const [folder, setFolder] = useState<FolderInfo | null>(null);
  const [rule, setRule] = useState<RenameRule>({
    prefix: '사진_',
    start: 1,
    digits: 3,
    extFilter: '',
  });
  const [slow, setSlow] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);

  // 미리보기는 Renderer에서 바로 계산한다 (실행 때는 Main이 다시 계산)
  const plan = useMemo(
    () => makePlan(folder?.files ?? [], rule),
    [folder, rule],
  );

  useEffect(() => window.api.onProgress(setProgress), []);

  const pick = async () => {
    const info = await window.api.pickFolder();
    if (info) {
      setFolder(info);
      setResult(null);
      setProgress(null);
    }
  };

  const run = async () => {
    setRunning(true);
    setResult(null);
    setProgress(null);
    const r = await window.api.start(rule, slow);
    setResult(r);
    setRunning(false);
    if (r.renamed > 0) setFolder(await refresh());
  };

  // 실행 후 폴더 목록 다시 읽기: 같은 폴더를 다시 고르게 하지 않으려면 별도 API가 필요하다.
  // 여기서는 미리보기 목록을 새 이름으로 바꿔 보여 준다.
  const refresh = async (): Promise<FolderInfo | null> => {
    if (!folder) return null;
    const renamed = new Map(plan.items.map((it) => [it.from, it.to]));
    return { ...folder, files: folder.files.map((f) => renamed.get(f) ?? f) };
  };

  const set = (patch: Partial<RenameRule>) => setRule({ ...rule, ...patch });
  const percent = progress
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  return (
    <div className="app">
      <section className="controls">
        <button onClick={pick} disabled={running}>
          폴더 선택
        </button>
        <span className="folder">
          {folder
            ? `${folder.folderName} (${folder.files.length}개 파일)`
            : '폴더를 선택하세요'}
        </span>
      </section>

      <section className="controls">
        <label>
          접두어{' '}
          <input
            value={rule.prefix}
            onChange={(e) => set({ prefix: e.target.value })}
          />
        </label>
        <label>
          시작 번호
          <input
            type="number"
            value={rule.start}
            onChange={(e) => set({ start: Number(e.target.value) })}
          />
        </label>
        <label>
          자릿수
          <input
            type="number"
            value={rule.digits}
            onChange={(e) => set({ digits: Number(e.target.value) })}
          />
        </label>
        <label>
          확장자{' '}
          <input
            placeholder=".jpg"
            value={rule.extFilter}
            onChange={(e) => set({ extFilter: e.target.value })}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={slow}
            onChange={(e) => setSlow(e.target.checked)}
          />{' '}
          느리게 실행(학습용)
        </label>
      </section>

      {plan.problems.length > 0 && (
        <ul className="problems">
          {plan.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <table className="preview">
        <thead>
          <tr>
            <th>현재 이름</th>
            <th>새 이름</th>
          </tr>
        </thead>
        <tbody>
          {plan.items.map((it) => (
            <tr key={it.from}>
              <td>{it.from}</td>
              <td>{it.to}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="controls">
        <button
          onClick={run}
          disabled={
            running ||
            !folder ||
            plan.items.length === 0 ||
            plan.problems.length > 0
          }
        >
          {plan.items.length}개 이름 바꾸기
        </button>
        <button onClick={() => window.api.cancel()} disabled={!running}>
          취소
        </button>
        <progress max={100} value={percent} />
        <span>{progress ? `${percent}% ${progress.current}` : ''}</span>
      </section>

      {result && (
        <p className="result">
          {result.canceled
            ? '취소했습니다. 바꾼 이름을 모두 되돌렸습니다.'
            : result.errors.length > 0
              ? `실패: ${result.errors.join(' / ')}${result.rolledBack ? ' (원래 이름으로 되돌림)' : ''}`
              : `${result.renamed}개 파일의 이름을 바꿨습니다.`}
        </p>
      )}
    </div>
  );
}
