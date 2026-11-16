import type { DocDetail } from '../../shared/ipc';
import { describeDoc } from './DocList';

export default function DocPreview({ doc }: { doc: DocDetail | null }) {
  if (!doc) {
    return (
      <section className="doc-preview empty">
        왼쪽 목록에서 문서를 고르세요.
      </section>
    );
  }
  return (
    <section className="doc-preview">
      <h2>{doc.name}</h2>
      <p className="doc-meta">{describeDoc(doc)}</p>
      {doc.warning && <p className="warn-box">{doc.warning}</p>}
      {doc.suspicious.length > 0 && (
        <div className="warn-box">
          이 문서에는 AI에게 내리는 지시처럼 보이는 문장이 있습니다. 분석 결과를
          원문과 대조해 확인하세요.
          <ul>
            {doc.suspicious.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      {/* 문서 내용은 텍스트로만 보여 준다. HTML로 해석하지 않는다 */}
      <pre className="doc-text">{doc.text}</pre>
    </section>
  );
}
