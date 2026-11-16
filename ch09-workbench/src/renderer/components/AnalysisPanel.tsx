import { useEffect, useRef, useState } from 'react';
import type { AnalyzeResult, DocDetail } from '../../shared/ipc';
import type { AnalysisKind } from '../../shared/prompts';

const LABEL: Record<AnalysisKind, string> = {
  summary: '요약',
  keywords: '핵심어',
  qa: '질문',
};

let lastRequestId = 0;

export default function AnalysisPanel({ doc }: { doc: DocDetail | null }) {
  const [question, setQuestion] = useState('');
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState<AnalysisKind | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const currentId = useRef(0);

  // 스트리밍 조각을 받아 화면에 이어 붙인다. 지금 요청의 조각만 받는다
  useEffect(
    () =>
      window.api.onLlmDelta(({ requestId, delta }) => {
        if (requestId === currentId.current) setOutput((t) => t + delta);
      }),
    [],
  );

  // 다른 문서를 고르면 결과를 비운다
  useEffect(() => {
    setOutput('');
    setResult(null);
  }, [doc?.id]);

  const run = async (kind: AnalysisKind) => {
    if (!doc) return;
    const requestId = ++lastRequestId;
    currentId.current = requestId;
    setRunning(kind);
    setOutput('');
    setResult(null);
    try {
      const r = await window.api.analyze({
        requestId,
        docId: doc.id,
        kind,
        question,
      });
      if (currentId.current === requestId) setResult(r);
    } finally {
      setRunning(null);
    }
  };

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
            if (e.key === 'Enter' && question.trim()) run('qa');
          }}
        />
        <button
          onClick={() => run('qa')}
          disabled={disabled || question.trim() === ''}
        >
          질문
        </button>
      </div>
      {running && <p className="status">{LABEL[running]} 생성 중...</p>}
      {/* LLM 응답도 텍스트로만 표시한다 (HTML로 해석하지 않는다) */}
      {output && <pre className="output">{output}</pre>}
      {result && !result.ok && <p className="error">{result.message}</p>}
      {result?.ok && (
        <p className="status">
          {result.model} · 문서 {result.sentChars.toLocaleString()}자 전송
          {result.clipped && ' (앞부분만)'} ·{' '}
          {(result.elapsedMs / 1000).toFixed(1)}초
        </p>
      )}
    </section>
  );
}
