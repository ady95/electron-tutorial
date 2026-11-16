import { useEffect, useState } from 'react';
import type { JobStatus, JobSummary } from '../../shared/ipc';

const STATUS_LABEL: Record<JobStatus, string> = {
  done: '완료',
  canceled: '취소',
  failed: '실패',
};

export default function HistoryPanel({ refreshKey }: { refreshKey: number }) {
  const [query, setQuery] = useState('');
  const [jobs, setJobs] = useState<JobSummary[]>([]);

  // 입력이 멈추고 0.3초 뒤에 검색한다
  useEffect(() => {
    const timer = setTimeout(() => {
      window.api.searchHistory(query).then(setJobs);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, refreshKey]);

  const clearAll = async () => {
    if (!window.confirm('작업 이력을 모두 지울까요?')) return;
    await window.api.clearHistory();
    setJobs(await window.api.searchHistory(query));
  };

  return (
    <div className="panel">
      <section className="controls">
        <input
          className="search"
          placeholder="폴더 이름이나 파일 이름으로 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span>{jobs.length}건</span>
        <button onClick={clearAll}>이력 모두 지우기</button>
      </section>
      <table className="preview history">
        <thead>
          <tr>
            <th>시각</th>
            <th>폴더</th>
            <th>파일 수</th>
            <th>결과</th>
            <th>이름 변경 계획(일부)</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id}>
              <td>{new Date(job.startedAt).toLocaleString('ko-KR')}</td>
              <td>{job.folderName}</td>
              <td>{job.total}</td>
              <td title={job.message}>{STATUS_LABEL[job.status]}</td>
              <td>{job.sample.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
