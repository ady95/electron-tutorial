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
      {/* 문서 내용은 텍스트로만 보여 준다. HTML로 해석하지 않는다 */}
      <pre className="doc-text">{doc.text}</pre>
    </section>
  );
}
