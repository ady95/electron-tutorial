import { useEffect, useRef, useState } from 'react';
import type { AnalysisRecord, DocDetail } from '../../shared/ipc';
import type { AnalysisKind } from '../../shared/prompts';

const LABEL: Record<AnalysisKind, string> = {
  summary: '요약',
  keywords: '핵심어',
  qa: '질문',
};

const titleOf = (a: AnalysisRecord) =>
  a.question ? `${LABEL[a.kind]}: ${a.question}` : LABEL[a.kind];

const metaOf = (a: AnalysisRecord) =>
  `${a.model} · 문서 ${a.sentChars.toLocaleString()}자 전송${a.clipped ? ' (앞부분만)' : ''} · ${(a.elapsedMs / 1000).toFixed(1)}초`;

let lastRequestId = 0;

interface Props {
  doc: DocDetail | null;
  focusAnalysisId: number | null; // 검색 결과에서 고른 분석
  onSaved: () => void;
}

export default function AnalysisPanel({
  doc,
  focusAnalysisId,
  onSaved,
}: Props) {
  const [question, setQuestion] = useState('');
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState<AnalysisKind | null>(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<AnalysisRecord[]>([]);
  const [shownId, setShownId] = useState<number | null>(null);
  const currentId = useRef(0);

  // 스트리밍 조각을 받아 화면에 이어 붙인다. 지금 요청의 조각만 받는다
  useEffect(
    () =>
      window.api.onLlmDelta(({ requestId, delta }) => {
        if (requestId === currentId.current) setOutput((t) => t + delta);
      }),
    [],
  );

  const loadHistory = async (docId: number) => {
    const list = await window.api.listAnalyses(docId);
    setHistory(list);
    return list;
  };

  // 문서가 바뀌면 저장된 분석을 불러온다. 검색에서 고른 분석이 있으면 그것을 보여 준다
  useEffect(() => {
    setOutput('');
    setError('');
    setShownId(null);
    setHistory([]);
    if (!doc) return;
    loadHistory(doc.id).then((list) => {
      const focus = list.find((a) => a.id === focusAnalysisId);
      if (focus) {
        setShownId(focus.id);
        setOutput(focus.result);
      }
    });
  }, [doc?.id, focusAnalysisId]);

  const run = async (kind: AnalysisKind) => {
    if (!doc) return;
    const requestId = ++lastRequestId;
    currentId.current = requestId;
    setRunning(kind);
    setOutput('');
    setError('');
    setShownId(null);
    try {
      const r = await window.api.analyze({
        requestId,
        docId: doc.id,
        kind,
        question,
      });
      if (currentId.current !== requestId) return;
      if (r.ok) {
        await loadHistory(doc.id);
        setShownId(r.analysisId);
        setOutput(r.text);
        onSaved();
      } else {
        setError(r.message);
      }
    } finally {
      setRunning(null);
    }
  };

  const show = (a: AnalysisRecord) => {
    setShownId(a.id);
    setOutput(a.result);
    setError('');
  };

  const shown = history.find((a) => a.id === shownId);
  const disabled = !doc || running !== null || doc.chars === 0;

  return (
    <section className="analysis">
      <h3>AI 분석</h3>
      <div className="controls">
        <button onClick={() => run('summary')} disabled={disabled}>
          요약
        </button>
        <button onClick={() => run('keywords')} disabled={disabled}>
          핵심어
        </button>
      </div>
      <div className="controls">
        <input
          className="question"
          placeholder="문서에 대해 질문하기"
          value={question}
          maxLength={500}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && question.trim() && !disabled) run('qa');
          }}
        />
        <button
          onClick={() => run('qa')}
          disabled={disabled || question.trim() === ''}
        >
          질문
        </button>
      </div>
      {running && (
        <div className="controls">
          <span className="status">{LABEL[running]} 생성 중...</span>
          <button onClick={() => window.api.cancelAnalysis(currentId.current)}>
            취소
          </button>
        </div>
      )}
      {doc && doc.suspicious.length > 0 && (
        <p className="warn-box">
          주의: 이 문서에는 AI에게 내리는 지시처럼 보이는 문장이 있습니다.
          결과가 원문과 다른지 확인하세요.
        </p>
      )}
      {shown && <p className="shown-title">{titleOf(shown)}</p>}
      {/* LLM 응답도 텍스트로만 표시한다 (HTML로 해석하지 않는다) */}
      {output && <pre className="output">{output}</pre>}
      {error && <p className="error">{error}</p>}
      {shown && <p className="status">{metaOf(shown)}</p>}

      {history.length > 0 && (
        <>
          <h3>저장된 분석 {history.length}건</h3>
          <ul className="history">
            {history.map((a) => (
              <li
                key={a.id}
                className={a.id === shownId ? 'selected' : ''}
                onClick={() => show(a)}
              >
                <span>{titleOf(a)}</span>
                <span className="status">
                  {new Date(a.createdAt).toLocaleString('ko-KR')}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
